document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('role') !== 'teacher') {
        location.href = 'index.html';
        return;
    }

    // elements
    const groupList = document.getElementById('group-list');
    const groupForm = document.getElementById('group-form');
    const groupNameInput = document.getElementById('group-name');
    const groupFilter = document.getElementById('group-filter');
    const assignList = document.getElementById('assignment-list');
    const assignForm = document.getElementById('assignment-form');
    const assignTitle = document.getElementById('assign-title');
    const assignDesc = document.getElementById('assign-desc');
    const assignGroupSelect = document.getElementById('assign-group');
    const addTcBtn = document.getElementById('add-testcase');
    const studentForm = document.getElementById('student-form');
    const studUser = document.getElementById('student-username');
    const studPass = document.getElementById('student-password');
    const studGroup = document.getElementById('student-group');
    const studentList = document.getElementById('student-list');
    const inputFile = document.getElementById('inputFile');
    const outputFile = document.getElementById('outputFile');

    // initial load
    Promise.all([
        fetch('/groups', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json()),
        fetch('/assignments', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json()),
        fetch('/students', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json())
    ]).then(([groups, assignments, students]) => {
        renderGroups(groups);
        renderAssignments(assignments);
        renderStudents(students);
    }).catch(console.error);

    // utils
    function renderGroups(groups) {
        groupList.innerHTML = '';
        groupFilter.innerHTML = '<option value="all">All</option>';
        assignGroupSelect.innerHTML = '';
        studGroup.innerHTML = '';
        groups.forEach(g => {
            const li = document.createElement('li');
            li.textContent = g.name;
            groupList.appendChild(li);

            [groupFilter, assignGroupSelect, studGroup].forEach(sel => {
                const opt = new Option(g.name, g.id);
                sel.add(opt);
            });
        });
        gsap.from('#group-list li', { opacity: 0, y: 10, stagger: 0.05 });
    }

    function renderAssignments(data) {
        const filter = groupFilter.value;
        assignList.innerHTML = '';
        data.filter(a => filter === 'all' || a.group_id === filter).forEach(a => {
            const li = document.createElement('li');
            li.textContent = `${a.title} (${a.description || ''})`;
            assignList.appendChild(li);
        });
    }

    function renderStudents(stu) {
        studentList.innerHTML = '';
        stu.forEach(s => {
            const li = document.createElement('li');
            li.textContent = `${s.username} - ${s.groupname || ''}`;
            studentList.appendChild(li);
        });
    }

    // create group
    groupForm.addEventListener('submit', async e => {
        e.preventDefault();
        const res = await fetch('/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ name: groupNameInput.value })
        });
        if (res.ok) {
            const g = await res.json();
            renderGroups([...(await fetch('/groups', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json()))]);
            groupNameInput.value = '';
        } else alert('failed');
    });

    // add text testcase fields
    addTcBtn.addEventListener('click', () => {
        const wrap = document.getElementById('testcases');
        const div = document.createElement('div');
        div.className = 'testcase flex gap-2';
        div.innerHTML = `
        <textarea class="test-input flex-1 px-2 py-1 rounded bg-white/70" placeholder="Input"></textarea>
        <textarea class="test-output flex-1 px-2 py-1 rounded bg-white/70" placeholder="Expected output"></textarea>`;
        wrap.appendChild(div);
    });

    // create assignment
    assignForm.addEventListener('submit', async e => {
        e.preventDefault();
        const textCases = Array.from(document.querySelectorAll('.testcase')).map(div => ({
            input: div.querySelector('.test-input').value,
            output: div.querySelector('.test-output').value
        })).filter(c => c.input || c.output);

        const fd = new FormData();
        fd.append('title', assignTitle.value);
        fd.append('description', assignDesc.value);
        fd.append('groupId', assignGroupSelect.value);
        if (textCases.length) fd.append('testcases', JSON.stringify(textCases));
        if (inputFile.files[0]) fd.append('inputFile', inputFile.files[0]);
        if (outputFile.files[0]) fd.append('outputFile', outputFile.files[0]);

        const res = await fetch('/assignments', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token },
            body: fd
        });
        if (res.ok) {
            alert('created');
            // reload assignment list
            const list = await fetch('/assignments', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
            renderAssignments(list);
            assignForm.reset();
            document.getElementById('testcases').innerHTML = `
          <h4 class="font-semibold">Text Test Cases</h4>
          <div class="testcase flex gap-2">
            <textarea class="test-input flex-1 px-2 py-1 rounded bg-white/70" placeholder="Input"></textarea>
            <textarea class="test-output flex-1 px-2 py-1 rounded bg-white/70" placeholder="Expected output"></textarea>
          </div>`;
        }
    });

    // create student
    studentForm.addEventListener('submit', async e => {
        e.preventDefault();
        const res = await fetch('/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({
                username: studUser.value,
                password: studPass.value,
                group_id: studGroup.value
            })
        });
        if (res.ok) {
            alert('student added');
            const list = await fetch('/students', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
            renderStudents(list);
            studentForm.reset();
        }
    });

    // filter change
    groupFilter.addEventListener('change', () => {
        fetch('/assignments', { headers: { Authorization: 'Bearer ' + token } })
            .then(r => r.json())
            .then(renderAssignments);
    });
});
