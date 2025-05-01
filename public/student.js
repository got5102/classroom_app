document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('role') !== 'student') {
        location.href = 'index.html';
        return;
    }

    const list = document.getElementById('assignment-list-student');
    const panel = document.getElementById('submission-panel');
    const titleEl = document.getElementById('submit-assignment-title');
    const descEl = document.getElementById('submit-assignment-desc');
    const form = document.getElementById('submit-form');
    const editor = document.getElementById('code-editor');
    const resultDiv = document.getElementById('submission-result');
    const langSel = document.getElementById('code-lang');

    let currentId = null;

    // load assignments
    fetch('/assignments', { headers: { Authorization: 'Bearer ' + token } })
        .then(r => r.json())
        .then(arr => {
            if (!arr.length) list.innerHTML = '<li>No assignments</li>';
            arr.forEach(a => {
                const li = document.createElement('li');
                li.className = 'cursor-pointer hover:underline';
                li.textContent = `${a.title} - ${a.description || ''}`;
                li.addEventListener('click', () => {
                    currentId = a.id;
                    titleEl.textContent = a.title;
                    descEl.textContent = a.description || '';
                    panel.classList.remove('hidden');
                    gsap.from(panel, { opacity: 0, y: 20, duration: 0.4 });
                });
                list.appendChild(li);
            });
            gsap.from('#assignment-list-student li', { opacity: 0, y: 10, stagger: 0.07 });
        });

    // submit
    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!currentId) return;
        resultDiv.textContent = 'Running...';
        const res = await fetch('/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({
                assignmentId: currentId,
                code: editor.value,
                language: langSel.value
            })
        });
        const js = await res.json();
        if (!res.ok) {
            resultDiv.textContent = js.error || 'Error';
            resultDiv.className = 'text-red-600 font-semibold';
        } else {
            resultDiv.textContent = `${js.passed}/${js.totalTests} tests passed (score ${js.score}%)`;
            resultDiv.className = 'text-green-700 font-semibold';
        }
    });
});
