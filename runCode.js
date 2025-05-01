const fs = require('fs');
const { exec, execSync } = require('child_process');
const path = require('path');
const os = require('os');

const TMP = os.tmpdir();

async function compareFiles(a, b) {
    const bufA = await fs.promises.readFile(a);
    const bufB = await fs.promises.readFile(b);
    return bufA.equals(bufB);
}

module.exports = function runCode(code, language, testcases) {
    return new Promise((resolve) => {
        const uid = Date.now() + '_' + Math.random().toString(36).slice(2);
        let src, bin, cmd;

        try {
            if (language === 'python') {
                src = path.join(TMP, `sub_${uid}.py`);
                fs.writeFileSync(src, code);
                cmd = `python3 "${src}"`;
            } else if (language === 'c') {
                src = path.join(TMP, `sub_${uid}.c`);
                bin = path.join(TMP, `sub_${uid}`);
                fs.writeFileSync(src, code);
                execSync(`gcc "${src}" -o "${bin}"`, { timeout: 8000 });
                cmd = `"${bin}"`;
            } else if (language === 'cpp') {
                src = path.join(TMP, `sub_${uid}.cpp`);
                bin = path.join(TMP, `sub_${uid}`);
                fs.writeFileSync(src, code);
                execSync(`g++ -std=c++17 "${src}" -o "${bin}"`, { timeout: 8000 });
                cmd = `"${bin}"`;
            } else {
                return resolve({ error: 'Unsupported language', passed: 0, totalTests: 0, score: 0 });
            }
        } catch {
            return resolve({ error: 'Compilation error', passed: 0, totalTests: testcases.length, score: 0 });
        }

        let passed = 0;

        const runTest = (i) => {
            if (i >= testcases.length) {
                const score = testcases.length ? Math.round((passed / testcases.length) * 100) : 0;
                cleanup();
                return resolve({ passed, totalTests: testcases.length, score });
            }
            const tc = testcases[i];

            if (tc.kind === 'text') {
                exec(cmd, { input: tc.input_text, timeout: 5000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
                    const out = (stdout || '').toString().trim().replace(/\r\n/g, '\n');
                    const exp = (tc.output_text || '').trim().replace(/\r\n/g, '\n');
                    if (!err && out === exp) passed++;
                    runTest(i + 1);
                });
            } else {
                const tempOut = path.join(TMP, `out_${uid}_${i}`);
                try {
                    execSync(`${cmd} < "${tc.input_path}" > "${tempOut}"`, { timeout: 5000, maxBuffer: 1024 * 1024 });
                    compareFiles(tempOut, tc.output_path).then((eq) => {
                        if (eq) passed++;
                        fs.unlink(tempOut, () => runTest(i + 1));
                    });
                } catch {
                    fs.unlink(tempOut, () => runTest(i + 1));
                }
            }
        };

        function cleanup() {
            try { fs.unlinkSync(src); } catch { }
            try { fs.unlinkSync(bin); } catch { }
        }

        runTest(0);
    });
};
