const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * 提出されたコードを実行してテスト
 * @param {string} code - 提出されたコード
 * @param {string} language - プログラミング言語
 * @param {string} input - テスト入力
 * @returns {Promise<{output: string}>} - 実行結果
 */
async function runCode(code, language, input) {
    // 一時ファイル用のディレクトリ
    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir);
    }
    
    // 一意のファイル名を生成
    const fileId = uuidv4();
    
    try {
        let filePath, command;
        
        // 言語に応じたファイル作成とコマンド設定
        switch (language) {
            case 'python':
                filePath = path.join(tmpDir, `${fileId}.py`);
                fs.writeFileSync(filePath, code);
                command = `python ${filePath}`;
                break;
                
            case 'c':
                const cFilePath = path.join(tmpDir, `${fileId}.c`);
                const cOutPath = path.join(tmpDir, fileId);
                fs.writeFileSync(cFilePath, code);
                
                // コンパイル
                await new Promise((resolve, reject) => {
                    exec(`gcc ${cFilePath} -o ${cOutPath}`, (error) => {
                        if (error) {
                            reject(new Error(`Compilation error: ${error.message}`));
                        } else {
                            resolve();
                        }
                    });
                });
                
                command = cOutPath;
                break;
                
            case 'cpp':
                const cppFilePath = path.join(tmpDir, `${fileId}.cpp`);
                const cppOutPath = path.join(tmpDir, fileId);
                fs.writeFileSync(cppFilePath, code);
                
                // コンパイル
                await new Promise((resolve, reject) => {
                    exec(`g++ ${cppFilePath} -o ${cppOutPath}`, (error) => {
                        if (error) {
                            reject(new Error(`Compilation error: ${error.message}`));
                        } else {
                            resolve();
                        }
                    });
                });
                
                command = cppOutPath;
                break;
                
            default:
                throw new Error('Unsupported language');
        }
        
        // 入力ファイルを作成
        const inputPath = path.join(tmpDir, `${fileId}.in`);
        if (input) {
            fs.writeFileSync(inputPath, input);
        }
        
        // コードを実行（タイムアウト10秒）
        const output = await new Promise((resolve, reject) => {
            const proc = exec(`${command} < ${inputPath}`, {
                timeout: 10000,
                maxBuffer: 1024 * 1024 // 1MB
            }, (error, stdout, stderr) => {
                if (error && error.killed) {
                    reject(new Error('Execution timeout'));
                } else if (error) {
                    reject(new Error(`Execution error: ${stderr}`));
                } else {
                    resolve(stdout);
                }
            });
        });
        
        return { output };
    } catch (error) {
        return { output: `Error: ${error.message}` };
    } finally {
        // 一時ファイルを削除
        const filesToDelete = [
            path.join(tmpDir, `${fileId}.py`),
            path.join(tmpDir, `${fileId}.c`),
            path.join(tmpDir, `${fileId}.cpp`),
            path.join(tmpDir, fileId),
            path.join(tmpDir, `${fileId}.in`)
        ];
        
        filesToDelete.forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
    }
}

module.exports = runCode;
