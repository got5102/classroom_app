// backend/server.js

import express from 'express';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { exec } from 'child_process';
import { createClient } from '@supabase/supabase-js';

// 環境変数から Supabase の情報を取得
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORT                 = process.env.PORT || 3000;

// Supabase の管理用クライアントを初期化 (Service Role Key)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const app = express();
app.use(express.json({ limit: '1mb' }));

// コード実行用ユーティリティ
const execCommand = (cmd, options={}) =>
  new Promise(resolve => {
    exec(cmd, options, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });

app.post('/run', async (req, res) => {
  const { assignmentId, code, language } = req.body;
  if (!assignmentId || !code || !language) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  // JWT で認証
  let userId;
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;
    if (!token) throw new Error('No token');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) throw new Error('Auth failed');
    userId = user.id;
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 課題情報取得
  const { data: assignment, error: aErr } = await supabaseAdmin
    .from('assignments')
    .select('group_id, created_by, output_mode, output_filename, input_filename')
    .eq('id', assignmentId)
    .single();
  if (aErr || !assignment) {
    return res.status(404).json({ error: 'Assignment not found' });
  }

  // 権限チェック
  const isTeacher = assignment.created_by === userId;
  if (!isTeacher) {
    const { data: membership } = await supabaseAdmin
      .from('group_members')
      .select('user_id')
      .eq('group_id', assignment.group_id)
      .eq('user_id', userId);
    if (!membership?.length) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  // テストケース取得
  const { data: testCases, error: tcErr } = await supabaseAdmin
    .from('test_cases')
    .select('input_data, expected_output')
    .eq('assignment_id', assignmentId);
  if (tcErr) {
    return res.status(500).json({ error: 'Failed to fetch test cases' });
  }

  // 一時ディレクトリ作成
  let tmpDir;
  try {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-run-'));
  } catch {
    return res.status(500).json({ error: 'Sandbox creation failed' });
  }

  let compileError = null;
  let runCmd = '';

  try {
    // コード保存＆コンパイル
    if (language === 'python') {
      await fs.writeFile(path.join(tmpDir, 'Main.py'), code);
      const { error: pyErr, stderr: pyStderr } = await execCommand(
        'python -m py_compile Main.py', { cwd: tmpDir }
      );
      if (pyErr) compileError = pyStderr || pyErr.message;
      else runCmd = 'python Main.py';
    }
    else if (language === 'cpp') {
      await fs.writeFile(path.join(tmpDir, 'main.cpp'), code);
      const { error: cppErr, stderr: cppStderr } = await execCommand(
        'g++ main.cpp -o main.out', { cwd: tmpDir }
      );
      if (cppErr) compileError = cppStderr || cppErr.message;
      else runCmd = './main.out';
    }
    else if (language === 'java') {
      await fs.writeFile(path.join(tmpDir, 'Main.java'), code);
      const { error: javacErr, stderr: javacStderr } = await execCommand(
        'javac Main.java', { cwd: tmpDir }
      );
      if (javacErr) compileError = javacStderr || javacErr.message;
      else runCmd = 'java Main';
    }
    else {
      compileError = 'Unsupported language';
    }

    if (compileError) {
      return res.json({ error: compileError });
    }

    // テスト実行
    let passed = 0;
    for (const tc of testCases) {
      // 入力ファイル
      const inFile = assignment.input_filename || 'input.txt';
      await fs.writeFile(path.join(tmpDir, inFile), tc.input_data || '');

      // ファイル出力モード時は出力ファイル削除
      if (assignment.output_mode === 'file' && assignment.output_filename) {
        try {
          await fs.unlink(path.join(tmpDir, assignment.output_filename));
        } catch {}
      }

      const { error: runErr, stdout } = await execCommand(runCmd, {
        cwd: tmpDir,
        timeout: 5000
      });

      let output = '';
      if (assignment.output_mode === 'file') {
        try {
          output = await fs.readFile(
            path.join(tmpDir, assignment.output_filename || 'output.txt'),
            'utf-8'
          );
        } catch {}
      } else {
        output = stdout;
      }

      const exp = (tc.expected_output || '').trimEnd();
      if (!runErr && output.trimEnd() === exp) {
        passed++;
      }
    }

    const total = testCases.length;
    const allPassed = passed === total;

    // 学生の場合は submission 登録
    if (!isTeacher) {
      await supabaseAdmin.from('submissions').insert({
        assignment_id: assignmentId,
        student_id: userId,
        code,
        language,
        passed: allPassed,
        score: passed,
        submitted_at: new Date().toISOString()
      });
    }

    return res.json({ score: passed, total });
  }
  catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Execution error' });
  }
  finally {
    // クリーンアップ
    if (tmpDir) {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  }
});

// ヘルスチェック用 (任意)
app.get('/healthz', (_req, res) => res.send('OK'));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
