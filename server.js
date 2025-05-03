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

/* -- auth helper -- */
const JWT_SECRET = process.env.JWT_SECRET;
const auth = role => (req, res, next) => {
    const h = req.headers.authorization;
    if (!h) return res.sendStatus(401);
    try {
        const p = jwt.verify(h.split(' ')[1], JWT_SECRET);
        if (role && p.role !== role) return res.sendStatus(403);
        req.user = p; next();
    } catch { return res.sendStatus(401); }
};

/* -- health check -- */
app.get('/healthz', (_, r) => r.sendStatus(200));

/* -- static -- */
app.use(express.static(path.join(__dirname, 'public')));

/* --- login --- */
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const { rows } = await db('select * from users where username=$1', [username]);
    if (!rows[0]) return res.status(401).json({ error: 'user' });
    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'pass' });
    const token = jwt.sign({ id: rows[0].id, role: rows[0].role }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, role: rows[0].role });
});

/* --- groups, students same as before --- */

/* --- assignments --- */
app.get('/assignments', auth('teacher'), async (req, res) => {
    const { rows } = await db(
        `select a.*, g.name as group_name 
     from assignments a join groups g on a.group_id=g.id
     where g.teacher_id=$1`, [req.user.id]);
    res.json(rows);
});
app.post('/assignments', auth('teacher'), upload.fields([{ name: 'inputFile' }, { name: 'outputFile' }]), async (req, res) => {
    const { title, description, groupId, testcases } = req.body;
    const { rows } = await db(
        `insert into assignments(group_id,title,description) values($1,$2,$3) returning *`,
        [groupId, title, description]);
    const a = rows[0];
    await insertTestcases(a.id, testcases, req.files);
    res.json(a);
});
app.put('/assignments/:id', auth('teacher'), upload.fields([{ name: 'inputFile' }, { name: 'outputFile' }]), async (req, res) => {
    const { id } = req.params;
    const { title, description, testcases } = req.body;
    await db('update assignments set title=$1,description=$2 where id=$3',
        [title, description, id]);
    await db('delete from testcases where assignment_id=$1', [id]);
    await insertTestcases(id, testcases, req.files);
    res.json({ updated: true });
});
async function insertTestcases(aid, testcases, files) {
    if (testcases) {
        JSON.parse(testcases).forEach(tc => {
            db('insert into testcases(assignment_id,kind,input_text,output_text) values($1,$2,$3,$4)',
                [aid, 'text', tc.input, tc.output]);
        });
    }
    if (files?.inputFile) {
        const inp = files.inputFile[0].path;
        const out = files.outputFile?.[0]?.path;
        await db('insert into testcases(assignment_id,kind,input_path,output_path) values($1,$2,$3,$4)',
            [aid, 'file', inp, out]);
    }
}

/* --- submissions API for teacher --- */
app.get('/submissions/:aid', auth('teacher'), async (req, res) => {
    const { aid } = req.params;
    const { rows } = await db(
        `select s.*, u.username
       from submissions s
       join users u on u.id=s.student_id
       join assignments a on a.id=s.assignment_id
       join groups g on g.id=a.group_id
      where s.assignment_id=$1
        and g.teacher_id=$2
      order by s.submitted_at desc`,
        [aid, req.user.id]);
    res.json(rows);
});

/* --- student endpoints そのまま --- */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('listening on', PORT));

/* submissions 取得 (教師は全員分 / 学生は自分) */
app.get('/submissions/:aid', auth(), async (req, res) => {
    const { aid } = req.params;
    if (req.user.role === 'teacher') {
        const { rows } = await db(/* 前節と同じクエリ */, [aid, req.user.id]); return res.json(rows);
    } else {
        const { rows } = await db(
            `select * from submissions where assignment_id=$1 and student_id=$2 order by submitted_at desc`,
            [aid, req.user.id]);
        res.json(rows);
    }
});
