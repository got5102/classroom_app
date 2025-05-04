// src/pages/LoginPage.jsx

import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

function LoginPage() {
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]       = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError]     = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (isSignUp) {
      // サインアップ
      const { data: { user }, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (user) {
        // profiles テーブルに必ずレコードを追加
        const { error: profErr } = await supabase
          .from('profiles')
          .insert({
            id:   user.id,
            name: name || '名無し',
            role: 'student',
          });

        if (profErr) {
          console.error('profiles 挿入失敗:', profErr);
          setError('ユーザー登録に失敗しました。再度お試しください。');
        }
        // 挿入成功後は自動ログインされるので、App.jsx 側でリダイレクトされます
      }
    } else {
      // ログイン
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow-md w-80">
        <h2 className="text-xl font-bold mb-4 text-center">
          {isSignUp ? 'サインアップ' : 'ログイン'}
        </h2>

        {isSignUp && (
          <input
            type="text"
            placeholder="表示名"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="mb-3 w-full px-3 py-2 border rounded"
          />
        )}

        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="mb-3 w-full px-3 py-2 border rounded"
        />

        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          className="mb-4 w-full px-3 py-2 border rounded"
        />

        {error && <div className="text-red-500 text-sm mb-2">{error}</div>}

        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded">
          {isSignUp ? 'サインアップ' : 'ログイン'}
        </button>

        <p className="mt-4 text-center text-sm">
          {isSignUp ? 'すでにアカウントをお持ちですか？' : 'アカウントをお持ちでないですか？'}
          <span
            className="text-blue-600 cursor-pointer ml-1"
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp ? 'ログイン' : 'サインアップ'}
          </span>
        </p>
      </form>
    </div>
  );
}

export default LoginPage;
