// backend/server.js
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables (Supabase URL and service role key, etc.)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORT = process.env.PORT || 3000;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const app = express();
app.use(express.json({ limit: '1mb' }));

app.post('/run', async (req, res) => {
    const { assignmentId, code, language } = req.body;
    if (!assignmentId || !code || !language) {
        return res.status(400).json({ error: 'Missing parameters' });
    }
    // Verify user authentication via Supabase JWT
    let userId = null;
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
        if (!token) throw new Error('No token');
        const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !userData) throw new Error('Auth verification failed');
        userId = userData.user?.id || userData.id || null;
        if (!userId) throw new Error('Invalid user');
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch assignment details (including group and output settings)
    const { data: assignment, error: assignError } = await supabaseAdmin.from('assignments')
        .select('id, group_id, created_by, output_mode, output_filename, input_filename')
        .eq('id', assignmentId).single();
    if (assignError || !assignment) {
        return res.status(404).json({ error: 'Assignment not found' });
    }
    // Authorization: ensure user is part of this assignment (teacher or student in group)
    const isTeacher = assignment.created_by === userId;
    let isStudent = false;
    if (!isTeacher) {
        const { data: membership } = await supabaseAdmin.from('group_members')
            .select('user_id').eq('group_id', assignment.group_id).eq('user_id', userId);
        if (membership && membership.length > 0) isStudent = true;
        if (!isStudent) {
            return res.status(403).json({ error: 'Forbidden' });
        }
    }

    // Fetch all test cases for the assignment
    const { data: testCases, error: tcError } = await supabaseAdmin.from('test_cases')
        .select('id, input_data, expected_output').eq('assignment_id', assignmentId);
    if (tcError) {
        return res.status(500).json({ error: 'Could not fetch test cases' });
    }

    // Set up a temporary directory for code execution
    let tmpDir;
    try {
        tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'code-run-'));
    } catch (err) {
        return res.status(500).json({ error: 'Failed to create sandbox environment' });
    }

    // Utility to run a shell command and await completion
    const execCommand = (cmd, options = {}) => {
        return new Promise((resolve) => {
            exec(cmd, options, (error, stdout, stderr) => {
                resolve({ error, stdout, stderr });
            });
        });
    };

    let compileErrorMsg = null;
    let executableCommand = null; // command to run the compiled code (for C++/Java)
    try {
        // Write the code to a file depending on language
        if (language === 'python') {
            await fs.promises.writeFile(path.join(tmpDir, 'Main.py'), code);
            // Optional: check syntax by compiling to bytecode
            const { error: pyError, stderr: pyStderr } = await execCommand('python -m py_compile Main.py', { cwd: tmpDir });
            if (pyError) {
                compileErrorMsg = pyStderr || pyError.message;
            }
        } else if (language === 'cpp') {
            await fs.promises.writeFile(path.join(tmpDir, 'main.cpp'), code);
            const { error: cppErr, stdout: cppOut, stderr: cppErrOut } = await execCommand('g++ main.cpp -o main.out', { cwd: tmpDir });
            if (cppErr) {
                // Capture compilation errors
                compileErrorMsg = cppErrOut || cppErr.message;
            } else {
                executableCommand = `./main.out`;
            }
        } else if (language === 'java') {
            await fs.promises.writeFile(path.join(tmpDir, 'Main.java'), code);
            const { error: javacErr, stderr: javacErrOut } = await execCommand('javac Main.java', { cwd: tmpDir });
            if (javacErr) {
                compileErrorMsg = javacErrOut || javacErr.message;
            } else {
                executableCommand = 'java Main';
            }
        } else {
            compileErrorMsg = 'Unsupported language';
        }

        if (compileErrorMsg) {
            // Compilation failed - return error (do not record submission for compile errors)
            return res.json({ error: compileErrorMsg });
        }

        // Now run the code against each test case
        let passedCount = 0;
        for (const tc of testCases) {
            // Prepare input file for this test case
            const inputFileName = assignment.input_filename || 'input.txt';
            const inputPath = path.join(tmpDir, inputFileName);
            await fs.promises.writeFile(inputPath, tc.input_data ?? '');
            // Remove any existing output file before run (for file output mode)
            if (assignment.output_mode === 'file' && assignment.output_filename) {
                const outPath = path.join(tmpDir, assignment.output_filename);
                try { await fs.promises.unlink(outPath); } catch { }
            }
            // Execute the program
            let runCmd = '';
            if (language === 'python') {
                runCmd = 'python Main.py';
            } else if (language === 'cpp') {
                runCmd = executableCommand; // "./main.out"
            } else if (language === 'java') {
                runCmd = executableCommand; // "java Main"
            }
            const { error: runErr, stdout: runOut, stderr: runErrOut } = await execCommand(runCmd, { cwd: tmpDir, timeout: 5000, maxBuffer: 5 * 1024 * 1024 });
            let programOutput = '';
            if (assignment.output_mode === 'file') {
                // Read output file content
                try {
                    const outPath = path.join(tmpDir, assignment.output_filename || 'output.txt');
                    programOutput = await fs.promises.readFile(outPath, 'utf-8');
                } catch (e) {
                    programOutput = '';
                }
            } else {
                // Use captured stdout
                programOutput = runOut;
            }
            // Normalize outputs (trim trailing newlines)
            const expected = (tc.expected_output ?? '').replace(/(\r?\n)+$/, '');
            const actual = (programOutput ?? '').replace(/(\r?\n)+$/, '');
            if (!runErr && actual === expected) {
                passedCount++;
            } else {
                // (Even if one fails, we continue to run remaining tests to get full coverage)
            }
        }

        // Determine overall result
        const totalTests = testCases.length;
        const passedAll = passedCount === totalTests;

        // Record the submission in the database (if from a student)
        if (isStudent) {
            await supabaseAdmin.from('submissions').insert({
                assignment_id: assignmentId,
                student_id: userId,
                code,
                language,
                passed: passedAll,
                score: passedCount,
                submitted_at: new Date().toISOString()
            });
        }

        // Return the outcome
        return res.json({ score: passedCount, total: totalTests });
    } catch (err) {
        console.error('Execution error:', err);
        return res.status(500).json({ error: 'Execution failed' });
    } finally {
        // Cleanup temp directory
        if (tmpDir) {
            try { await fs.promises.rm(tmpDir, { recursive: true, force: true }); } catch { }
        }
    }
});

// Start the server
app.listen(PORT, () => {
    console.log('Code Runner service listening on port', PORT);
});
