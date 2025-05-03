document.addEventListener('DOMContentLoaded', () => {
    // 認証チェック
    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('role') !== 'teacher') {
        location.href = 'index.html';
        return;
    }

    // DOM要素
    const assignmentList = document.getElementById('assignment-list');
    const createAssignmentBtn = document.getElementById('create-assignment-btn');
    const assignmentEditor = document.getElementById('assignment-editor');
    const assignmentDetail = document.getElementById('assignment-detail');
    const submissionDetail = document.getElementById('submission-detail');
    const welcomePanel = document.getElementById('welcome-panel');
    const assignmentForm = document.getElementById('assignment-form');
    const cancelAssignmentBtn = document.getElementById('cancel-assignment');
    const addTestBtn = document.getElementById('add-test-btn');
    const testCases = document.getElementById('test-cases');
    const submissionsList = document.getElementById('submissions-list');

    let assignments = [];
    let currentAssignment = null;
    let editMode = false;

    // 初期化
    loadAssignments();
    setupEventListeners();
    setupDarkMode();

    // 課題一覧を読み込む
    function loadAssignments() {
        fetch('/assignments', {
            headers: { Authorization: 'Bearer ' + token }
        })
        .then(res => res.json())
        .then(data => {
            assignments = data;
            updateAssignmentList();
        })
        .catch(err => {
            console.error('Failed to load assignments:', err);
        });
    }

    // 課題一覧を更新
    function updateAssignmentList() {
        assignmentList.innerHTML = '';
        
        if (assignments.length === 0) {
            assignmentList.innerHTML = '<p class="text-slate-500 text-center py-2">課題はありません</p>';
            return;
        }
        
        assignments.forEach(assignment => {
            const li = document.createElement('li');
            li.className = 'assignment-item';
            
            // 提出状況バッジ
            const submissionCount = assignment.submissions?.length || 0;
            let badgeClass = 'badge-yellow';
            let badgeText = '未提出';
            
            if (submissionCount > 0) {
                badgeClass = 'badge-green';
                badgeText = `${submissionCount}件の提出`;
            }
            
            li.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="font-medium">${assignment.title}</span>
                    <span class="badge ${badgeClass}">${badgeText}</span>
                </div>
                <p class="text-sm text-slate-600 truncate">${assignment.description || '説明なし'}</p>
            `;
            
            li.addEventListener('click', () => {
                showAssignmentDetail(assignment);
            });
            
            assignmentList.appendChild(li);
        });
        
        // アニメーション
        gsap.from('#assignment-list .assignment-item', {
            opacity: 0,
            y: 10,
            stagger: 0.07,
            ease: 'power2.out'
        });
    }

    // 課題詳細を表示
    function showAssignmentDetail(assignment) {
        currentAssignment = assignment;
        
        // 詳細情報を設定
        document.getElementById('detail-title').textContent = assignment.title;
        document.getElementById('detail-desc').textContent = assignment.description || '説明なし';
        
        // テストケース一覧
        const testsList = document.getElementById('detail-tests');
        testsList.innerHTML = '';
        
        if (assignment.tests?.length > 0) {
            assignment.tests.forEach((test, index) => {
                const li = document.createElement('li');
                li.className = 'p-2 border-b border-slate-200 last:border-0';
                li.innerHTML = `
                    <div class="font-medium">テストケース ${index + 1}</div>
                    <div class="grid grid-cols-2 gap-2 mt-1">
                        <div>
                            <div class="text-xs text-slate-500">入力:</div>
                            <div class="font-mono text-sm bg-white/70 p-1 rounded">${test.input || '(なし)'}</div>
                        </div>
                        <div>
                            <div class="text-xs text-slate-500">期待される出力:</div>
                            <div class="font-mono text-sm bg-white/70 p-1 rounded">${test.output || '(なし)'}</div>
                        </div>
                    </div>
                `;
                testsList.appendChild(li);
            });
        } else {
            testsList.innerHTML = '<li class="p-2 text-slate-500">テストケースはありません</li>';
        }
        
        // 提出物一覧
        updateSubmissionsList(assignment);
        
        // パネル表示切替
        hideAllPanels();
        assignmentDetail.classList.remove('hidden');
        
        // アニメーション
        gsap.from(assignmentDetail, { opacity: 0, y: 20, duration: 0.4 });
    }

    // 提出物一覧を更新
    function updateSubmissionsList(assignment) {
        submissionsList.innerHTML = '';
        
        if (!assignment.submissions || assignment.submissions.length === 0) {
            submissionsList.innerHTML = '<tr><td colspan="4" class="p-2 text-slate-500 text-center">提出はありません</td></tr>';
            return;
        }
        
        assignment.submissions.forEach(submission => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-slate-200 hover:bg-white/30';
            
            // スコアに応じたクラスを設定
            let scoreClass = 'text-yellow-600';
            if (submission.score >= 80) {
                scoreClass = 'text-green-600';
            } else if (submission.score < 50) {
                scoreClass = 'text-red-600';
            }
            
            const date = new Date(submission.submittedAt).toLocaleString('ja-JP');
            
            tr.innerHTML = `
                <td class="p-2">${submission.studentName}</td>
                <td class="p-2">${date}</td>
                <td class="p-2 font-semibold ${scoreClass}">${submission.score}%</td>
                <td class="p-2">
                    <button class="neo-btn-sm view-submission">
                        <i class="fas fa-eye mr-1"></i>詳細
                    </button>
                </td>
            `;
            
            tr.querySelector('.view-submission').addEventListener('click', () => {
                showSubmissionDetail(submission);
            });
            
            submissionsList.appendChild(tr);
        });
    }

    // 提出物の詳細を表示
    function showSubmissionDetail(submission) {
        document.getElementById('submission-student').textContent = submission.studentName;
        document.getElementById('submission-language').textContent = submission.language;
        document.getElementById('submission-score').textContent = `${submission.score}%`;
        document.getElementById('submission-code').textContent = submission.code;
        
        // テスト結果
        const resultsList = document.getElementById('submission-results');
        resultsList.innerHTML = '';
        
        if (submission.testResults?.length > 0) {
            submission.testResults.forEach((result, index) => {
                const li = document.createElement('li');
                li.className = 'p-2 border-b border-slate-200 last:border-0';
                
                // 結果に応じたクラスを設定
                const passed = result.passed;
                const statusClass = passed ? 'text-green-600' : 'text-red-600';
                const statusIcon = passed ? 'fa-check' : 'fa-times';
                
                li.innerHTML = `
                    <div class="flex justify-between">
                        <span class="font-medium">テストケース ${index + 1}</span>
                        <span class="${statusClass}">
                            <i class="fas ${statusIcon} mr-1"></i>${passed ? '成功' : '失敗'}
                        </span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 mt-1">
                        <div>
                            <div class="text-xs text-slate-500">実際の出力:</div>
                            <div class="font-mono text-sm bg-white/70 p-1 rounded">${result.actualOutput || '(なし)'}</div>
                        </div>
                        <div>
                            <div class="text-xs text-slate-500">期待される出力:</div>
                            <div class="font-mono text-sm bg-white/70 p-1 rounded">${result.expectedOutput || '(なし)'}</div>
                        </div>
                    </div>
                `;
                
                resultsList.appendChild(li);
            });
        } else {
            resultsList.innerHTML = '<li class="p-2 text-slate-500">テスト結果はありません</li>';
        }
        
        // パネル表示切替
        hideAllPanels();
        submissionDetail.classList.remove('hidden');
        
        // アニメーション
        gsap.from(submissionDetail, { opacity: 0, y: 20, duration: 0.4 });
    }

    // 課題作成/編集フォームを表示
    function showAssignmentForm(assignment = null) {
        // 編集モードか新規作成モードか
        editMode = !!assignment;
        currentAssignment = assignment;
        
        // フォームの初期化
        assignmentForm.reset();
        testCases.innerHTML = '';
        
        if (editMode) {
            // 編集モードの場合、現在の情報を入力欄に設定
            document.getElementById('assignment-title').value = assignment.title;
            document.getElementById('assignment-desc').value = assignment.description || '';
            
            // テストケースの設定
            if (assignment.tests?.length > 0) {
                assignment.tests.forEach(test => {
                    addTestCase(test.input, test.output);
                });
            } else {
                addTestCase('', ''); // 空のテストケースを追加
            }
        } else {
            // 新規モードの場合は空のテストケースを1つ追加
            addTestCase('', '');
        }
        
        // パネル表示切替
        hideAllPanels();
        assignmentEditor.classList.remove('hidden');
        
        // アニメーション
        gsap.from(assignmentEditor, { opacity: 0, y: 20, duration: 0.4 });
    }

    // テストケースを追加
    function addTestCase(input = '', output = '') {
        const div = document.createElement('div');
        div.className = 'test-case flex items-start space-x-2';
        
        div.innerHTML = `
            <div class="flex-grow">
                <input placeholder="入力" class="test-input w-full px-3 py-2 rounded-lg bg-white/70 mb-2" value="${input}">
                <input placeholder="期待される出力" class="test-output w-full px-3 py-2 rounded-lg bg-white/70" value="${output}">
            </div>
            <button type="button" class="remove-test neo-btn-sm text-red-500"><i class="fas fa-times"></i></button>
        `;
        
        div.querySelector('.remove-test').addEventListener('click', function() {
            if (document.querySelectorAll('.test-case').length > 1) {
                div.remove();
            }
        });
        
        testCases.appendChild(div);
    }

    // すべてのパネルを非表示
    function hideAllPanels() {
        assignmentEditor.classList.add('hidden');
        assignmentDetail.classList.add('hidden');
        submissionDetail.classList.add('hidden');
        welcomePanel.classList.add('hidden');
    }

    // イベントリスナーの設定
    function setupEventListeners() {
        // 課題作成ボタン
        createAssignmentBtn.addEventListener('click', () => {
            showAssignmentForm();
        });
        
        // キャンセルボタン
        cancelAssignmentBtn.addEventListener('click', () => {
            hideAllPanels();
            welcomePanel.classList.remove('hidden');
        });
        
        // テストケース追加ボタン
        addTestBtn.addEventListener('click', () => {
            addTestCase();
        });
        
        // 課題編集ボタン
        document.getElementById('edit-assignment-btn').addEventListener('click', () => {
            if (currentAssignment) {
                showAssignmentForm(currentAssignment);
            }
        });
        
        // 課題削除ボタン
        document.getElementById('delete-assignment-btn').addEventListener('click', () => {
            if (currentAssignment && confirm('この課題を削除してもよろしいですか？')) {
                deleteAssignment(currentAssignment.id);
            }
        });
        
        // 提出詳細から戻るボタン
        document.getElementById('back-to-detail').addEventListener('click', () => {
            hideAllPanels();
            assignmentDetail.classList.remove('hidden');
        });
        
        // 課題フォーム送信
        assignmentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveAssignment();
        });
        
        // ログアウトボタン
        document.getElementById('logout-btn').addEventListener('click', () => {
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            location.href = 'index.html';
        });
    }

    // 課題を保存
    function saveAssignment() {
        // フォームからデータを収集
        const title = document.getElementById('assignment-title').value;
        const description = document.getElementById('assignment-desc').value;
        
        // テストケースを収集
        const tests = [];
        document.querySelectorAll('.test-case').forEach(testCase => {
            const input = testCase.querySelector('.test-input').value;
            const output = testCase.querySelector('.test-output').value;
            tests.push({ input, output });
        });
        
        // 送信するデータ
        const data = {
            title,
            description,
            tests
        };
        
        // 編集モードの場合はIDを追加
        if (editMode && currentAssignment) {
            data.id = currentAssignment.id;
        }
        
        // ボタンをロード状態に
        const submitBtn = assignmentForm.querySelector('button[type="submit"]');
        const originalContent = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';
        submitBtn.disabled = true;
        
        // API呼び出し
        const url = editMode ? `/assignments/${currentAssignment.id}` : '/assignments';
        const method = editMode ? 'PUT' : 'POST';
        
        fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(data)
        })
        .then(res => res.json())
        .then(result => {
            // 成功時は課題一覧を更新して詳細表示
            loadAssignments();
            
            if (result.id) {
                // 新規課題または更新した課題の詳細を表示
                fetch(`/assignments/${result.id}`, {
                    headers: { Authorization: 'Bearer ' + token }
                })
                .then(res => res.json())
                .then(assignment => {
                    showAssignmentDetail(assignment);
                });
            } else {
                // 詳細取得に失敗した場合はウェルカムパネル表示
                hideAllPanels();
                welcomePanel.classList.remove('hidden');
            }
        })
        .catch(err => {
            console.error('Failed to save assignment:', err);
            alert('課題の保存に失敗しました');
        })
        .finally(() => {
            // ボタンを元に戻す
            submitBtn.innerHTML = originalContent;
            submitBtn.disabled = false;
        });
    }

    // 課題を削除
    function deleteAssignment(id) {
        fetch(`/assignments/${id}`, {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + token }
        })
        .then(res => {
            if (res.ok) {
                // 成功時は課題一覧を更新してウェルカムパネル表示
                loadAssignments();
                hideAllPanels();
                welcomePanel.classList.remove('hidden');
            } else {
                alert('課題の削除に失敗しました');
            }
        })
        .catch(err => {
            console.error('Failed to delete assignment:', err);
            alert('課題の削除に失敗しました');
        });
    }

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
