document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('role') !== 'student') {
        location.href = 'index.html';
        return;
    }

    // ユーザー名表示
    const username = localStorage.getItem('username');
    document.getElementById('student-name').textContent = username;
    document.getElementById('welcome-name').textContent = username;

    // DOM要素
    const list = document.getElementById('assignment-list-student');
    const submissionPanel = document.getElementById('submission-panel');
    const welcomePanel = document.getElementById('welcome-panel');
    const historyPanel = document.getElementById('submission-history');
    const titleEl = document.getElementById('submit-assignment-title');
    const descEl = document.getElementById('submit-assignment-desc');
    const form = document.getElementById('submit-form');
    const editor = document.getElementById('code-editor');
    const resultDiv = document.getElementById('submission-result');
    const langSel = document.getElementById('code-lang');
    const statusBadge = document.getElementById('assignment-status');
    const historyList = document.getElementById('history-list');

    let currentId = null;
    let assignments = [];

    // 課題一覧をロード
    loadAssignments();

    // ダークモード設定
    setupDarkMode();

    // ログアウト処理
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        location.href = 'index.html';
    });

    // 課題一覧をロードする関数
    function loadAssignments() {
        fetch('/assignments', { headers: { Authorization: 'Bearer ' + token } })
            .then(r => r.json())
            .then(arr => {
                assignments = arr;
                updateAssignmentList();
            })
            .catch(err => {
                console.error('Failed to load assignments:', err);
            });
    }

    // 課題一覧を更新する関数
    function updateAssignmentList() {
        list.innerHTML = '';
        if (!assignments.length) {
            list.innerHTML = '<li class="p-3 text-slate-500">課題はありません</li>';
            return;
        }

        assignments.forEach(a => {
            const li = document.createElement('li');
            li.className = 'assignment-item';
            
            const status = getAssignmentStatus(a);
            
            li.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="font-medium">${a.title}</span>
                    <span class="badge ${status.class}">${status.text}</span>
                </div>
                <p class="text-sm text-slate-600 truncate">${a.description || '説明なし'}</p>
            `;
            
            li.addEventListener('click', () => {
                currentId = a.id;
                showAssignment(a);
            });
            
            list.appendChild(li);
        });

        // アニメーション
        gsap.from('#assignment-list-student .assignment-item', { 
            opacity: 0, 
            y: 10, 
            stagger: 0.07,
            ease: 'power2.out'
        });
    }

    // 課題のステータスを取得する関数
    function getAssignmentStatus(assignment) {
        // 提出状況などに基づいてステータスを返す（仮実装）
        if (assignment.submitted) {
            return {
                text: assignment.score >= 80 ? '完了' : '再提出',
                class: assignment.score >= 80 ? 'badge-green' : 'badge-yellow'
            };
        }
        return { text: '未提出', class: 'badge-red' };
    }

    // 課題を表示する関数
    function showAssignment(assignment) {
        titleEl.textContent = assignment.title;
        descEl.textContent = assignment.description || '説明なし';
        
        // ステータスの表示
        const status = getAssignmentStatus(assignment);
        statusBadge.textContent = status.text;
        statusBadge.className = `badge ${status.class}`;
        
        // 前回の提出コードがあれば表示（仮実装）
        if (assignment.lastSubmission) {
            editor.value = assignment.lastSubmission.code;
            langSel.value = assignment.lastSubmission.language;
        } else {
            editor.value = '';
            langSel.value = 'python';
        }
        
        // パネルの表示切替
        welcomePanel.classList.add('hidden');
        historyPanel.classList.add('hidden');
        submissionPanel.classList.remove('hidden');
        resultDiv.classList.add('hidden');
        
        // アニメーション
        gsap.from(submissionPanel, { opacity: 0, y: 20, duration: 0.4 });
    }

    // 提出処理
    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!currentId) return;

        // ボタンをロード状態に
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalContent = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 提出中...';
        submitBtn.disabled = true;

        try {
            resultDiv.textContent = '実行中...';
            resultDiv.className = 'bg-blue-100 p-4 rounded-lg';
            resultDiv.classList.remove('hidden');

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
                resultDiv.textContent = js.error || 'エラーが発生しました';
                resultDiv.className = 'bg-red-100 p-4 rounded-lg text-red-700';
            } else {
                // 成功時の表示
                resultDiv.innerHTML = `
                    <div class="flex justify-between items-center">
                        <h3 class="font-semibold">テスト結果</h3>
                        <span class="badge ${js.score >= 80 ? 'badge-green' : 'badge-yellow'}">
                            スコア: ${js.score}%
                        </span>
                    </div>
                    <p class="mt-2">${js.passed}/${js.totalTests} テスト成功</p>
                `;
                resultDiv.className = 'bg-white/70 p-4 rounded-lg';

                // アニメーション
                gsap.from(resultDiv, { opacity: 0, y: 10, duration: 0.3 });
                
                // 課題一覧を更新（提出状況が変わるため）
                loadAssignments();
            }
        } catch (error) {
            resultDiv.textContent = 'サーバーに接続できません';
            resultDiv.className = 'bg-red-100 p-4 rounded-lg text-red-700';
        } finally {
            // ボタンを元に戻す
            submitBtn.innerHTML = originalContent;
            submitBtn.disabled = false;
        }
    });

    // ダークモード設定
    function setupDarkMode() {
        const themeToggle = document.getElementById('theme-toggle');
        
        // ローカルストレージから設定を読み込み
        if (localStorage.getItem('darkMode') === 'true') {
            document.body.classList.add('dark-mode');
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        }
        
        // ダークモード切り替え
        themeToggle.addEventListener('click', () => {
            if (document.body.classList.contains('dark-mode')) {
                document.body.classList.remove('dark-mode');
                themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
                localStorage.setItem('darkMode', 'false');
            } else {
                document.body.classList.add('dark-mode');
                themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
                localStorage.setItem('darkMode', 'true');
            }
        });
    }
});
