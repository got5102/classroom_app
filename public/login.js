/**
 * login.js
 * 1. カードをふわっと表示（GSAP）
 * 2. ボタンにホバーエフェクト（光る＋浮かせる）
 * 3. フォーム送信で /login API を呼び、JWT を localStorage に保存
 *    → 役割で teacher.html / student.html へリダイレクト
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1) 初期アニメーション
    gsap.from('.glass', { y: 30, opacity: 0, duration: 1, ease: 'power3.out' });

    // 2) ネオモーフィックボタンのホバーエフェクト
    document.querySelectorAll('.neo-btn').forEach(btn => {
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
            err.textContent = js.error || 'Login failed';
            err.classList.remove('hidden');
            return;
        }
        // トークン保存 & 画面遷移
        localStorage.setItem('token', js.token);
        localStorage.setItem('role', js.role);
        location.href = js.role === 'teacher' ? 'teacher.html' : 'student.html';
    });
});
