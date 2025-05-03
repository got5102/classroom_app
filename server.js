// server.js
import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import multer from 'multer';
import { fileURLToPath } from 'url';
import runCode from './runCode.js';
import { query as db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
const upload = multer({ dest: path.join(__dirname, 'uploads') });

const JWT_SECRET = process.env.JWT_SECRET;

// --- Authentication middleware ---
function auth(role) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.sendStatus(401);
    const token = authHeader.split(' ')[1];
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (role && payload.role !== role) return res.sendStatus(403);
      req.user = payload;
      next();
    } catch {
      return res.sendStatus(401);
    }
  };
}

// --- Health check ---
app.get('/healthz', (_req, res) => {
  res.sendStatus(200);
});

// --- Static files ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Login ---
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const { rows } = await db('SELECT * FROM users WHERE username = $1', [username]);
  if (!rows[0]) return res.status(401).json({ error: 'Invalid credentials' });
  const user = rows[0];
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, role: user.role });
});

// --- Groups ---
app.get('/groups', auth('teacher'), async (req, res) => {
  const { rows } = await db('SELECT * FROM groups WHERE teacher_id = $1', [req.user.id]);
  res.json(rows);
});
app.post('/groups', auth('teacher'), async (req, res) => {
  const { name } = req.body;
  const { rows } = await db(
    'INSERT INTO groups (teacher_id, name) VALUES ($1, $2) RETURNING *',
    [req.user.id, name]
  );
  res.json(rows[0]);
});

// --- Students (teacher creates) ---
app.post('/students', auth('teacher'), async (req, res) => {
  const { username, password, group_id } = req.body;
  const hash = await bcrypt.hash(password, 10);
  await db(
    'INSERT INTO users (username, password_hash, role, group_id) VALUES ($1, $2, $3, $4)',
    [username, hash, 'student', group_id]
  );
  res.json({ ok: true });
});

// --- Assignments ---
app.get('/assignments', auth('teacher'), async (req, res) => {
  const { rows } = await db(
    `SELECT a.*, g.name AS group_name
       FROM assignments a
       JOIN groups g ON g.id = a.group_id
      WHERE g.teacher_id = $1
      ORDER BY a.id`,
    [req.user.id]
  );
  res.json(rows);
});
app.post(
  '/assignments',
  auth('teacher'),
  upload.fields([{ name: 'inputFile' }, { name: 'outputFile' }]),
  async (req, res) => {
    const { title, description, groupId, testcases } = req.body;
    const { rows } = await db(
      'INSERT INTO assignments (group_id, title, description) VALUES ($1, $2, $3) RETURNING *',
      [groupId, title, description]
    );
    const assignment = rows[0];

    // Insert testcases
    if (testcases) {
      JSON.parse(testcases).forEach(tc => {
        db(
          'INSERT INTO testcases (assignment_id, kind, input_text, output_text) VALUES ($1, $2, $3, $4)',
          [assignment.id, 'text', tc.input, tc.output]
        );
      });
    }
    if (req.files.inputFile) {
      const inp = req.files.inputFile[0].path;
      const out = req.files.outputFile?.[0]?.path;
      await db(
        'INSERT INTO testcases (assignment_id, kind, input_path, output_path) VALUES ($1, $2, $3, $4)',
        [assignment.id, 'file', inp, out]
      );
    }

    res.json(assignment);
  }
);
app.put(
  '/assignments/:id',
  auth('teacher'),
  upload.fields([{ name: 'inputFile' }, { name: 'outputFile' }]),
  async (req, res) => {
    const { id } = req.params;
    const { title, description, testcases } = req.body;
    await db(
      'UPDATE assignments SET title=$1, description=$2 WHERE id=$3',
      [title, description, id]
    );
    // Remove existing testcases
    await db('DELETE FROM testcases WHERE assignment_id = $1', [id]);

    // Insert new testcases
    if (testcases) {
      JSON.parse(testcases).forEach(tc => {
        db(
          'INSERT INTO testcases (assignment_id, kind, input_text, output_text) VALUES ($1, $2, $3, $4)',
          [id, 'text', tc.input, tc.output]
        );
      });
    }
    if (req.files.inputFile) {
      const inp = req.files.inputFile[0].path;
      const out = req.files.outputFile?.[0]?.path;
      await db(
        'INSERT INTO testcases (assignment_id, kind, input_path, output_path) VALUES ($1, $2, $3, $4)',
        [id, 'file', inp, out]
      );
    }

    res.json({ updated: true });
  }
);

// --- Submissions retrieval for teacher and student ---
app.get('/submissions/:aid', auth(), async (req, res) => {
  const { aid } = req.params;
  if (req.user.role === 'teacher') {
    const { rows } = await db(
      `SELECT s.*, u.username
         FROM submissions s
         JOIN users u ON u.id = s.student_id
         JOIN assignments a ON a.id = s.assignment_id
         JOIN groups g ON g.id = a.group_id
        WHERE s.assignment_id = $1
          AND g.teacher_id = $2
        ORDER BY s.submitted_at DESC`,
      [aid, req.user.id]
    );
    return res.json(rows);
  } else {
    const { rows } = await db(
      `SELECT * FROM submissions
        WHERE assignment_id = $1
          AND student_id = $2
        ORDER BY submitted_at DESC`,
      [aid, req.user.id]
    );
    return res.json(rows);
  }
});

// --- Student submit endpoint ---
app.post('/submit', auth('student'), async (req, res) => {
  const { assignmentId, code, language } = req.body;
  // Load testcases
  const { rows: tcRows } = await db(
    'SELECT * FROM testcases WHERE assignment_id = $1',
    [assignmentId]
  );
  // Run code
  const result = await runCode(code, language, tcRows);

  // Store submission
  await db(
    `INSERT INTO submissions
       (assignment_id, student_id, language, score, passed, total_tests)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      assignmentId,
      req.user.id,
      language,
      result.score,
      result.passed,
      result.totalTests
    ]
  );

  res.json(result);
});

// --- Serve at dynamic port ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`listening on ${PORT}`));
