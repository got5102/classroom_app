const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, execSync } = require('child_process');

const TMP = os.tmpdir();
const MAX_BUFFER = 1024 * 1024; // 1 MiB

// ファイル同士のバイト比較
async function compareFiles(a, b) {
    const bufA = await fs.promises.readFile(a);
    const bufB = await fs.promises.readFile(b);
    return bufA.equals(bufB);
}

module.exports = function runCode(code, language, testcases) {
    return new Promise((resolve) => {
        const uid = Date.now() + '_' + Math.random().toString(36).substr(2);
        let srcPath, binPath, cmd;

        // ソースファイル作成 & コンパイル
        try {
            if (language === 'python') {
                srcPath = path.join(TMP, `sub_${uid}.py`);
                fs.writeFileSync(srcPath, code);
                cmd = `python3 "${srcPath}"`;
            } else if (language === 'c') {
                srcPath = path.join(TMP, `sub_${uid}.c`);
                binPath = path.join(TMP, `sub_${uid}`);
                fs.writeFileSync(srcPath, code);
                execSync(`gcc "${srcPath}" -o "${binPath}"`, { timeout: 10000 });
                cmd = `"${binPath}"`;
            } else if (language === 'cpp') {
                srcPath = path.join(TMP, `sub_${uid}.cpp`);
                binPath = path.join(TMP, `sub_${uid}`);
                fs.writeFileSync(srcPath, code);
                execSync(`g++ -std=c++17 "${srcPath}" -o "${binPath}"`, { timeout: 10000 });
                cmd = `"${binPath}"`;
            } else {
                throw new Error('Unsupported language');
            }
        } catch (e) {
            // コンパイルエラー
            cleanup();
            return resolve({
                error: 'Compilation error',
                passed: 0,
                totalTests: testcases.length,
                score: 0
            });
        }

        let passed = 0;
        const total = testcases.length;
        const results = [];

        // テストケースを順に実行
        (async function runTest(i) {
            if (i >= total) {
                // 全テスト終了
                cleanup();
                const score = total > 0 ? Math.round((passed / total) * 100) : 0;
                return resolve({ passed, totalTests: total, score, results });
            }

            const tc = testcases[i];
            let stdout = '';
            let errOccurred = false;

            // 標準入出力 or ファイル出力
            if (tc.kind === 'text') {
                // テキストテスト
                exec(cmd, {
                    input: tc.input_text || '',
                    timeout: 5000,
                    maxBuffer: MAX_BUFFER
                }, (err, out) => {
                    stdout = (out || '').toString();
                    const ok = !err && stdout.trim() === (tc.output_text || '').trim();
                    if (ok) passed++;
                    results.push({ kind: 'text', ok, stdout });
                    runTest(i + 1);
                });
            } else {
                // ファイルテスト
                const tempOut = path.join(TMP, `out_${uid}_${i}`);
                try {
                    // 入力リダイレクトが必要ならシェルで
                    if (tc.input_path) {
                        execSync(`${cmd} < "${tc.input_path}" > "${tempOut}"`, {
                            timeout: 5000,
                            maxBuffer: MAX_BUFFER,
                            shell: true
                        });
                        // 期待ファイルがあれば比較
                        compareFiles(tempOut, tc.output_path).then((eq) => {
                            if (eq) passed++;
                            results.push({ kind: 'file', ok: eq, stdout: '' });
                            fs.unlink(tempOut, () => runTest(i + 1));
                        });
                    } else {
                        // 期待ファイルなし → stdout 出力比較
                        exec(cmd, { timeout: 5000, maxBuffer: MAX_BUFFER }, (err2, out2) => {
                            stdout = (out2 || '').toString();
                            const ok2 = !err2 && stdout.trim() === (tc.output_text || '').trim();
                            if (ok2) passed++;
                            results.push({ kind: 'file', ok: ok2, stdout });
                            runTest(i + 1);
                        });
                    }
                } catch (e) {
                    // 実行エラー → 不合格
                    results.push({ kind: 'file', ok: false, stdout: '' });
                    runTest(i + 1);
                }
            }
        })(0);

        // 後片付け
        function cleanup() {
            try { fs.unlinkSync(srcPath); } catch { }
            if (binPath) try { fs.unlinkSync(binPath); } catch { }
        }
    });
};
