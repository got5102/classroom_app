/**
 * login.js
 * 1. カードをふわっと表示（GSAP）
 * 2. ボタンにホバーエフェクト（光る＋浮かせる）
 * 3. フォーム送信で /login API を呼び、JWT を localStorage に保存
 *    → 役割で teacher.html / student.html へリダイレクト
 * 4. ダークモード切替機能を追加
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1) 初期アニメーション
    gsap.from('.glass', { y: 30, opacity: 0, duration: 1, ease: 'power3.out' });

    // 2) ネオモーフィックボタンのホバーエフェクト
    document.querySelectorAll('.neo-btn, .neo-btn-sm').forEach(btn => {
        const tl = gsap.timeline({ paused: true })
            .to(btn, { boxShadow: '0 0 20px rgba(255,255,255,.7)', duration: 0.25 })
            .to(btn, { boxShadow: '0 0 0 rgba(0,0,0,0)', duration: 0.25 });
        btn.addEventListener('mouseenter', () => tl.play(0));
        btn.addEventListener('mouseleave', () => tl.reverse());
    });

    // 3) ログイン処理
    const form = document.getElementById('login-form');
    const err = document.getElementById('login-error');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.classList.add('hidden');

        // ログインボタンをロード状態に
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalContent = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ログイン中...';
        submitBtn.disabled = true;

        try {
            const res = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: document.getElementById('username').value,
                    password: document.getElementById('password').value
                })
            });

            const js = await res.json();
            if (!res.ok) {
                err.textContent = js.error || 'ログインに失敗しました';
                err.classList.remove('hidden');
                gsap.from(err, { y: -10, opacity: 0, duration: 0.3 });
                return;
            }
            // トークン保存 & 画面遷移
            localStorage.setItem('token', js.token);
            localStorage.setItem('role', js.role);
            localStorage.setItem('username', document.getElementById('username').value);
            
            // 画面遷移のアニメーション
            gsap.to('.glass', { 
                y: -30, 
                opacity: 0, 
                duration: 0.5, 
                onComplete: () => {
                    location.href = js.role === 'teacher' ? 'teacher.html' : 'student.html';
                }
            });
        } catch (error) {
            err.textContent = 'サーバーに接続できません';
            err.classList.remove('hidden');
        } finally {
            // ボタンを元に戻す
            submitBtn.innerHTML = originalContent;
            submitBtn.disabled = false;
        }
    });

    // 4) ダークモード切り替え
    const themeToggle = document.getElementById('theme-toggle');
    const toggleDarkMode = () => {
        if (document.body.classList.contains('dark-mode')) {
            document.body.classList.remove('dark-mode');
            themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
            localStorage.setItem('darkMode', 'false');
        } else {
            document.body.classList.add('dark-mode');
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
            localStorage.setItem('darkMode', 'true');
        }
    };

    // ローカルストレージから設定を読み込み
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }

    themeToggle.addEventListener('click', toggleDarkMode);
});
