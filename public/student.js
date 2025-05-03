document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('role') !== 'student') return location.href = 'index.html';

    /* DOM */
    const pages = { home: $('#page-home'), detail: $('#page-detail') };
    const assignList = $('#assign-list');
    const detailTitle = $('#detail-title');
    const detailDesc = $('#detail-desc');
    const codeArea = $('#code-editor');
    const langSel = $('#code-lang');
    const resBox = $('#result-box');
    const resMsg = $('#result-msg');
    const resOut = $('#result-output');

    let currentAid = null, mySubs = {};

    /* util */
    function $(q) { return document.querySelector(q); }
    function show(p) { Object.values(pages).forEach(e => e.classList.add('hidden')); pages[p].classList.remove('hidden'); }

    /* fetch assignments */
    fetch('/assignments', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(renderAssignments);

    function card(a) {
        return `<div class="p-4 bg-white rounded-lg shadow hover:shadow-lg cursor-pointer">
        <h4 class="font-semibold">${a.title}</h4>
        <p class="text-sm text-slate-600">${a.description || ''}</p></div>`;
    }
    function renderAssignments(arr) {
        assignList.innerHTML = '';
        arr.forEach(a => {
            const li = document.createElement('li');
            li.innerHTML = card(a);
            li.onclick = () => openDetail(a);
            assignList.appendChild(li);
        });
    }

    function openDetail(a) {
        currentAid = a.id;
        detailTitle.textContent = a.title;
        detailDesc.textContent = a.description || '';
        codeArea.value = '';
        resBox.classList.add('hidden');
        show('detail');
        /* 直近の提出コード取得（あれば）*/
        fetch(`/submissions/${a.id}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json()).then(s => {
                mySubs = s.filter(x => x.student_id === parseJwt(token).id);
                if (mySubs[0]) codeArea.value = mySubs[0].code || '';
            });
    }

    /* 提出 */
    $('#submit-form').addEventListener('submit', async e => {
        e.preventDefault();
        resMsg.textContent = '実行中...'; resOut.textContent = ''; resBox.classList.remove('hidden');
        const res = await fetch('/submit', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ assignmentId: currentAid, code: codeArea.value, language: langSel.value })
        });
        const js = await res.json();
        if (!res.ok) { resMsg.className = 'text-red-600 font-semibold'; resMsg.textContent = js.error; return; }
        resMsg.className = 'text-green-700 font-semibold';
        resMsg.textContent = `${js.passed}/${js.totalTests} テスト合格 (スコア ${js.score}%)`;
        resOut.textContent = js.stdout || '(ファイル出力のみ)';
        /* 満点なら confetti */
        if (js.score === 100) {
            confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } }); /* :contentReference[oaicite:1]{index=1} */
        }
    });

    $('#back-home').onclick = () => show('home');
    $('#logout').onclick = () => { localStorage.clear(); location.href = 'index.html'; };

    /* JWT parse helper */
    function parseJwt(t) { return JSON.parse(atob(t.split('.')[1])); }
});
