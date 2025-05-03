// runCode.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec, execSync } from 'child_process';

const TMP = os.tmpdir();
const MAX_BUFFER = 1024 * 1024; // 1 MiB

// ファイル同士をバイト比較するヘルパー
async function compareFiles(a, b) {
  const bufA = await fs.promises.readFile(a);
  const bufB = await fs.promises.readFile(b);
  return bufA.equals(bufB);
}

/**
 * 提出コードを実行し、テストケース群を評価します。
 * @param {string} code   - ソースコード
 * @param {string} language - 'python' | 'c' | 'cpp'
 * @param {Array} testcases - DB から取得した testcases.rows
 * @returns {Promise<{passed:number,totalTests:number,score:number,stdout?:string}>}
 */
export default function runCode(code, language, testcases) {
  return new Promise((resolve) => {
    const uid = Date.now() + '_' + Math.random().toString(36).slice(2);
    let srcPath, binPath, cmd;

    // 1) ソースファイル書き出し＆コンパイル or 直接実行コマンド設定
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
    } catch (compileErr) {
      cleanup();
      return resolve({ passed: 0, totalTests: testcases.length, score: 0, error: 'Compilation error' });
    }

    let passed = 0;
    const total = testcases.length;

    // 2) 各テストケースを非同期で実行
    (function runTest(i) {
      if (i >= total) {
        // 全テスト完了
        cleanup();
        const score = total ? Math.round((passed / total) * 100) : 0;
        return resolve({ passed, totalTests: total, score });
      }

      const tc = testcases[i];
      // テキストテスト
      if (tc.kind === 'text') {
        exec(cmd, {
          input: tc.input_text || '',
          timeout: 5000,
          maxBuffer: MAX_BUFFER
        }, (err, out) => {
          const stdout = (out || '').toString();
          const ok = !err && stdout.trim() === (tc.output_text || '').trim();
          if (ok) passed++;
          runTest(i + 1);
        });

      // ファイルテスト
      } else {
        const tempOut = path.join(TMP, `out_${uid}_${i}`);
        // 入力ファイルあり
        if (tc.input_path) {
          try {
            execSync(`${cmd} < "${tc.input_path}" > "${tempOut}"`, {
              timeout: 5000,
              maxBuffer: MAX_BUFFER,
              shell: true
            });
            compareFiles(tempOut, tc.output_path).then(eq => {
              if (eq) passed++;
              fs.unlinkSync(tempOut);
              runTest(i + 1);
            });
          } catch {
            runTest(i + 1);
          }

        // 標準出力比較
        } else {
          exec(cmd, { timeout: 5000, maxBuffer: MAX_BUFFER }, (err2, out2) => {
            const stdout = (out2 || '').toString();
            const ok2 = !err2 && stdout.trim() === (tc.output_text || '').trim();
            if (ok2) passed++;
            runTest(i + 1);
          });
        }
      }
    })(0);

    // 3) 後片付け
    function cleanup() {
      try { fs.unlinkSync(srcPath); } catch {}
      if (binPath) {
        try { fs.unlinkSync(binPath); } catch {}
      }
    }
  });
}
