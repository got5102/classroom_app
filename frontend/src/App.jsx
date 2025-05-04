import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';

function App() {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(undefined);

  // 認証状態取得＋プロフィール読み込み
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user || null;
      setUser(u);
      if (u) loadProfile(u.id);
      else setProfile(false);
    };
    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      const u = session?.user || null;
      setUser(u);
      if (u) loadProfile(u.id);
      else setProfile(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadProfile = async (id) => {
    setProfile(undefined);
    const { data, error } = await supabase
      .from('profiles')
      .select('name, role')
      .eq('id', id)
      .single();
    if (error) {
      console.error('プロフィール取得失敗:', error);
      setProfile(false);
    } else {
      setProfile(data || false);
    }
  };

  // 未ログイン
  if (!user) {
    return <LoginPage />;
  }
  // プロフィール読み込み中
  if (profile === undefined) {
    return <div className="flex items-center justify-center h-screen">読み込み中…</div>;
  }
  // プロフィールなし
  if (profile === false) {
    return <div className="flex items-center justify-center h-screen text-red-500">
      プロフィールが見つかりません。しばらくお待ちいただくか再ログインしてください。
    </div>;
  }

  // ログイン＆プロフィール取得済み
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard profile={profile} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
