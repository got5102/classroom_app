const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const path = require('path');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const runCode = require('./runCode');

// 環境変数
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const app = express();

// ミドルウェア
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// JWT検証ミドルウェア
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden' });
        req.user = user;
        next();
    });
};

// ログインAPI
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        // データベースからユーザーを検索
        const result = await db.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        
        const user = result.rows[0];
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // JWTトークンを生成
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({ token, role: user.role });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 課題一覧を取得
app.get('/assignments', authenticateToken, async (req, res) => {
    try {
        let assignments;
        
        if (req.user.role === 'teacher') {
            // 教師の場合：すべての課題を取得
            const result = await db.query('SELECT * FROM assignments ORDER BY created_at DESC');
            assignments = result.rows;
            
            // 各課題の提出状況を取得
            for (let assignment of assignments) {
                const submissionsResult = await db.query(
                    'SELECT s.*, u.username as student_name FROM submissions s ' +
                    'JOIN users u ON s.user_id = u.id ' +
                    'WHERE s.assignment_id = $1 ORDER BY s.submitted_at DESC',
                    [assignment.id]
                );
                assignment.submissions = submissionsResult.rows;
            }
        } else {
            // 生徒の場合：課題と提出状況を取得
            const result = await db.query('SELECT * FROM assignments ORDER BY created_at DESC');
            assignments = result.rows;
            
            // 各課題の提出状況を取得
            for (let assignment of assignments) {
                const submissionResult = await db.query(
                    'SELECT * FROM submissions WHERE assignment_id = $1 AND user_id = $2 ORDER BY submitted_at DESC LIMIT 1',
                    [assignment.id, req.user.id]
                );
                
                if (submissionResult.rows.length > 0) {
                    assignment.submitted = true;
                    assignment.score = submissionResult.rows[0].score;
                    assignment.lastSubmission = submissionResult.rows[0];
                } else {
                    assignment.submitted = false;
                }
            }
        }
        
        res.json(assignments);
    } catch (err) {
        console.error('Error fetching assignments:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 課題詳細を取得
app.get('/assignments/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    
    try {
        // 課題の基本情報を取得
        const assignmentResult = await db.query(
            'SELECT * FROM assignments WHERE id = $1',
            [id]
        );
        
        if (assignmentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Assignment not found' });
        }
        
        const assignment = assignmentResult.rows[0];
        
        // テストケースを取得
        const testsResult = await db.query(
            'SELECT * FROM test_cases WHERE assignment_id = $1',
            [id]
        );
        assignment.tests = testsResult.rows;
        
        if (req.user.role === 'teacher') {
            // 教師の場合：すべての提出を取得
            const submissionsResult = await db.query(
                'SELECT s.*, u.username as student_name FROM submissions s ' +
                'JOIN users u ON s.user_id = u.id ' +
                'WHERE s.assignment_id = $1 ORDER BY s.submitted_at DESC',
                [id]
            );
            assignment.submissions = submissionsResult.rows;
            
            // 各提出のテスト結果を取得
            for (let submission of assignment.submissions) {
                const testResultsResult = await db.query(
                    'SELECT * FROM test_results WHERE submission_id = $1',
                    [submission.id]
                );
                submission.testResults = testResultsResult.rows;
            }
        } else {
            // 生徒の場合：自分の提出のみ取得
            const submissionResult = await db.query(
                'SELECT * FROM submissions WHERE assignment_id = $1 AND user_id = $2 ORDER BY submitted_at DESC LIMIT 1',
                [id, req.user.id]
            );
            
            if (submissionResult.rows.length > 0) {
                assignment.submitted = true;
                assignment.lastSubmission = submissionResult.rows[0];
                
                const testResultsResult = await db.query(
                    'SELECT * FROM test_results WHERE submission_id = $1',
                    [assignment.lastSubmission.id]
                );
                assignment.lastSubmission.testResults = testResultsResult.rows;
            } else {
                assignment.submitted = false;
            }
        }
        
        res.json(assignment);
    } catch (err) {
        console.error('Error fetching assignment details:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 課題を作成
app.post('/assignments', authenticateToken, async (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    
    const { title, description, tests } = req.body;
    
    if (!title) {
        return res.status(400).json({ error: 'Title is required' });
    }
    
    try {
        // トランザクション開始
        await db.query('BEGIN');
        
        // 課題を作成
        const assignmentResult = await db.query(
            'INSERT INTO assignments (title, description, created_by) VALUES ($1, $2, $3) RETURNING *',
            [title, description, req.user.id]
        );
        
        const assignment = assignmentResult.rows[0];
        
        // テストケースを作成
        if (tests && tests.length > 0) {
            for (const test of tests) {
                await db.query(
                    'INSERT INTO test_cases (assignment_id, input, output) VALUES ($1, $2, $3)',
                    [assignment.id, test.input, test.output]
                );
            }
        }
        
        // トランザクション確定
        await db.query('COMMIT');
        
        res.status(201).json(assignment);
    } catch (err) {
        // エラー時はロールバック
        await db.query('ROLLBACK');
        console.error('Error creating assignment:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 課題を更新
app.put('/assignments/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    
    const { id } = req.params;
    const { title, description, tests } = req.body;
    
    if (!title) {
        return res.status(400).json({ error: 'Title is required' });
    }
    
    try {
        // トランザクション開始
        await db.query('BEGIN');
        
        // 課題を更新
        const assignmentResult = await db.query(
            'UPDATE assignments SET title = $1, description = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
            [title, description, id]
        );
        
        if (assignmentResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Assignment not found' });
        }
        
        const assignment = assignmentResult.rows[0];
        
        // 既存のテストケースを削除
        await db.query('DELETE FROM test_cases WHERE assignment_id = $1', [id]);
        
        // 新しいテストケースを作成
        if (tests && tests.length > 0) {
            for (const test of tests) {
                await db.query(
                    'INSERT INTO test_cases (assignment_id, input, output) VALUES ($1, $2, $3)',
                    [id, test.input, test.output]
                );
            }
        }
        
        // トランザクション確定
        await db.query('COMMIT');
        
        res.json(assignment);
    } catch (err) {
        // エラー時はロールバック
        await db.query('ROLLBACK');
        console.error('Error updating assignment:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 課題を削除
app.delete('/assignments/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    
    const { id } = req.params;
    
    try {
        // 課題を削除（参照整合性制約により、関連するレコードも削除される）
        const result = await db.query(
            'DELETE FROM assignments WHERE id = $1 RETURNING id',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Assignment not found' });
        }
        
        res.status(204).send();
    } catch (err) {
        console.error('Error deleting assignment:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 提出処理
app.post('/submit', authenticateToken, async (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    
    const { assignmentId, code, language } = req.body;
    
    if (!assignmentId || !code || !language) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    try {
        // 課題のテストケースを取得
        const testsResult = await db.query(
            'SELECT * FROM test_cases WHERE assignment_id = $1',
            [assignmentId]
        );
        
        const tests = testsResult.rows;
        if (tests.length === 0) {
            return res.status(400).json({ error: 'No test cases found for this assignment' });
        }
        
        // コードを実行してテスト
        const testResults = [];
        let passedCount = 0;
        
        for (const test of tests) {
            const result = await runCode(code, language, test.input);
            const passed = result.output.trim() === test.output.trim();
            
            if (passed) passedCount++;
            
            testResults.push({
                testId: test.id,
                passed,
                actualOutput: result.output,
                expectedOutput: test.output
            });
        }
        
        // スコアを計算
        const score = Math.round((passedCount / tests.length) * 100);
        
        // 提出を保存
        const submissionResult = await db.query(
            'INSERT INTO submissions (assignment_id, user_id, code, language, score) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [assignmentId, req.user.id, code, language, score]
        );
        
        const submissionId = submissionResult.rows[0].id;
        
        // テスト結果を保存
        for (const result of testResults) {
            await db.query(
                'INSERT INTO test_results (submission_id, test_id, passed, actual_output) VALUES ($1, $2, $3, $4)',
                [submissionId, result.testId, result.passed, result.actualOutput]
            );
        }
        
        res.json({
            submissionId,
            passed: passedCount,
            totalTests: tests.length,
            score,
            testResults
        });
    } catch (err) {
        console.error('Error processing submission:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// サーバー起動
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
