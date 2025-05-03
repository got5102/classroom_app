document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('role') !== 'teacher') {
        location.href = 'index.html';
        return;
    }

    /* DOM */
    const pages = {
        assign: document.getElementById('page-assignments'),
        create: document.getElementById('page-create'),
        detail: document.getElementById('page-detail')
    };
    const navAssign = document.getElementById('nav-assignments');
    const navCreate = document.getElementById('nav-create');
    const assignList = document.getElementById('assignment-list');
    const groupSelect = document.getElementById('assign-group');
    const assignForm = document.getElementById('assignment-form');
    const addTcBtn = document.getElementById('add-testcase');
    const backBtn = document.getElementById('back-to-list');
    const detailTitle = document.getElementById('detail-title');
    const detailDesc = document.getElementById('detail-desc');
    const subBody = document.getElementById('submissions-body');

    /* util */
    const showPage = key => {
        Object.values(pages).forEach(p => p.classList.add('hidden'));
        pages[key].classList.remove('hidden');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        if (key === 'assign') navAssign.classList.add('active');
        if (key === 'create') navCreate.classList.add('active');
    };

    /* 初期データ取得 */
    let groups = [];
    let assignments = [];

    Promise.all([
        fetch('/groups', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch('/assignments', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
    ]).then(([g, a]) => {
        groups = g;
        assignments = a;
        renderGroups();
        renderAssignments();
    });

    function renderGroups() {
        groupSelect.innerHTML = '';
        groups.forEach(g => groupSelect.add(new Option(g.name, g.id)));
    }

    function cardHTML(a) {
        return `
        <div class="p-4 bg-white rounded-lg shadow hover:shadow-lg cursor-pointer">
          <h4 class="font-semibold">${a.title}</h4>
          <p class="text-sm text-slate-600">${a.description || ''}</p>
          <p class="text-xs mt-1">Group: ${groups.find(g => g.id === a.group_id)?.name || ''}</p>
        </div>`;
    }

    function renderAssignments() {
        assignList.innerHTML = '';
        assignments.forEach(a => {
            const li = document.createElement('li');
            li.innerHTML = cardHTML(a);
            li.addEventListener('click', () => openDetail(a));
            assignList.appendChild(li);
        });
    }

    /* ページ切り替え */
    navAssign.onclick = () => showPage('assign');
    navCreate.onclick = () => {
        assignForm.reset();
        document.getElementById('assign-id').value = '';
        showPage('create');
    };

    /* テストケース追加 */
    addTcBtn.onclick = () => {
        const div = document.createElement('div');
        div.className = 'testcase flex gap-2';
        div.innerHTML = `
        <textarea class="test-input input-field flex-1" placeholder="入力"></textarea>
        <textarea class="test-output input-field flex-1" placeholder="期待出力"></textarea>`;
        document.getElementById('testcases').appendChild(div);
    };

    /* 課題保存 */
    assignForm.addEventListener('submit', async e => {
        e.preventDefault();
        const id = document.getElementById('assign-id').value;
        const title = document.getElementById('assign-title').value;
        const desc = document.getElementById('assign-desc').value;
        const groupId = groupSelect.value;
        const textCases = Array.from(document.querySelectorAll('.testcase')).map(t => ({
            input: t.querySelector('.test-input').value,
            output: t.querySelector('.test-output').value
        })).filter(x => x.input || x.output);

        const fd = new FormData();
        fd.append('title', title);
        fd.append('description', desc);
        fd.append('groupId', groupId);
        if (textCases.length) fd.append('testcases', JSON.stringify(textCases));

        const inFile = document.getElementById('inputFile').files[0];
        const outFile = document.getElementById('outputFile').files[0];
        if (inFile) fd.append('inputFile', inFile);
        if (outFile) fd.append('outputFile', outFile);

        let url = '/assignments', method = 'POST';
        if (id) { url += '/' + id; method = 'PUT'; fd.append('id', id); }

        const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, body: fd });
        if (res.ok) {
            assignments = await fetch('/assignments', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
            renderAssignments();
            showPage('assign');
        } else alert('保存失敗');
    });

    /* キャンセル */
    document.getElementById('cancel-edit').onclick = () => showPage('assign');

    /* 課題詳細ページ */
    async function openDetail(a) {
        detailTitle.textContent = a.title;
        detailDesc.textContent = a.description || '';
        showPage('detail');
        subBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center">Loading...</td></tr>';
        const subs = await fetch(`/submissions/${a.id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
        subBody.innerHTML = subs.map(s => `
        <tr class="border-t">
          <td class="p-2">${s.username}</td>
          <td class="p-2">${s.language}</td>
          <td class="p-2">${s.score}%</td>
          <td class="p-2">${s.passed}/${s.total_tests}</td>
          <td class="p-2">${new Date(s.submitted_at).toLocaleString()}</td>
        </tr>
      `).join('');
    }

    backBtn.onclick = () => showPage('assign');

    /* Logout */
    document.getElementById('logout').onclick = () => {
        localStorage.clear();
        location.href = 'index.html';
    };
});
