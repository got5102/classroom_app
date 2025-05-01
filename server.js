require('dotenv').config();           // .env (ローカル用)
const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const db = require('./db');
const runCode = require('./runCode');

const upload = multer({ dest: path.join(__dirname, 'uploads') });
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (_req, res) => {
    res.status(200).send('OK');
});

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;

// ---------- middleware ----------
function auth(role) {
    return (req, res, next) => {
        const h = req.headers.authorization;
        if (!h) return res.sendStatus(401);
        try {
            const payload = jwt.verify(h.split(' ')[1], JWT_SECRET);
            if (role && payload.role !== role) return res.sendStatus(403);
            req.user = payload;
            next();
        } catch { res.sendStatus(401); }
    };
}

// ---------- routes ----------
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const { rows } = await db.query('select * from users where username=$1', [username]);
    if (!rows[0]) return res.status(401).json({ error: 'no user' });
    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'bad pass' });
    const token = jwt.sign({ id: rows[0].id, role: rows[0].role }, JWT_SECRET, { expiresIn: '4h' });
    res.json({ token, role: rows[0].role });
});

// ---------- teacher ----------
app.get('/groups', auth('teacher'), async (req, res) => {
    const { rows } = await db.query('select * from groups where teacher_id=$1', [req.user.id]);
    res.json(rows);
});

app.post('/groups', auth('teacher'), async (req, res) => {
    const { name } = req.body;
    const { rows } = await db.query(
        'insert into groups (teacher_id,name) values ($1,$2) returning *',
        [req.user.id, name]);
    res.json(rows[0]);
});

app.post('/students', auth('teacher'), async (req, res) => {
    const { username, password, group_id } = req.body;
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await db.query(
        'insert into users (username,password_hash,role,group_id) values ($1,$2,$3,$4)',
        [username, hash, 'student', group_id]);
    res.json({ ok: true });
});

// 課題作成（テキスト＋ファイル両対応）
app.post(
    '/assignments',
    auth('teacher'),
    upload.fields([{ name: 'inputFile' }, { name: 'outputFile' }]),
    async (req, res) => {
        const { title, description, groupId, testcases } = req.body;
        const { rows: assRows } =
            await db.query('insert into assignments (group_id,title,description) values ($1,$2,$3) returning *',
                [groupId, title, description]);
        const a = assRows[0];

        const tcInsert = [];

        // テキストケース (JSON 文字列で来る)
        if (testcases) {
            JSON.parse(testcases).forEach(tc => {
                tcInsert.push(db.query(
                    'insert into testcases (assignment_id, kind, input_text, output_text) values ($1,$2,$3,$4)',
                    [a.id, 'text', tc.input, tc.output]));
            });
        }

        // ファイルケース
        if (req.files.inputFile) {
            const inp = req.files.inputFile[0].path;
            const out = req.files.outputFile?.[0]?.path;
            tcInsert.push(db.query(
                'insert into testcases (assignment_id, kind, input_path, output_path) values ($1,$2,$3,$4)',
                [a.id, 'file', inp, out]));
        }
        await Promise.all(tcInsert);
        res.json(a);
    });

// ---------- student ----------
app.get('/assignments', auth('student'), async (req, res) => {
    const { rows: me } = await db.query('select group_id from users where id=$1', [req.user.id]);
    const { rows } = await db.query('select * from assignments where group_id=$1', [me[0].group_id]);
    res.json(rows);
});

app.post('/submit', auth('student'), async (req, res) => {
    const { assignmentId, code, language } = req.body;
    const { rows: tcRows } = await db.query('select * from testcases where assignment_id=$1', [assignmentId]);
    const result = await runCode(code, language, tcRows);
    await db.query(
        'insert into submissions (assignment_id, student_id, language, score, passed, total_tests) values ($1,$2,$3,$4,$5,$6)',
        [assignmentId, req.user.id, language, result.score, result.passed, result.totalTests]);
    res.json(result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`listening on ${PORT}`));
