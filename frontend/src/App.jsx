// src/App.jsx

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import GroupManagement from './pages/GroupManagement';
import AssignmentDetail from './pages/AssignmentDetail';
import AssignmentEdit from './pages/AssignmentEdit';

function App() {
  // user: Supabase Auth でのログインユーザー情報
  // profile: undefined → 読み込み中、オブジェクト → 取得済、false → レコードなし
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(undefined);

  useEffect(() => {
    // 初回セッションチェック
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user || null;
      setUser(u);
      if (u) {
        loadProfile(u.id);
      } else {
        setProfile(false);
      }
    });
    // 認証状態のリスナー
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      const u = session?.user || null;
      setUser(u);
      if (u) {
        loadProfile(u.id);
      } else {
        setProfile(false);
      }
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // プロフィール読み込み関数
  const loadProfile = async (userId) => {
    setProfile(undefined); // 読み込み中
    const { data, error } = await supabase
      .from('profiles')
      .select('name, role')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('プロフィール取得失敗:', error);
      setProfile(false);
    } else {
      setProfile(data || false);
    }
  };

  // 未ログインならログイン画面へ
  if (!user) {
    return <LoginPage />;
  }

  // プロフィール読み込み中
  if (profile === undefined) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600">
        読み込み中…
      </div>
    );
  }

  // プロフィールが存在しない（DBにレコードなし）
  if (profile === false) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        プロフィールが見つかりません。管理者にお問い合わせください。
      </div>
    );
  }

  // 認証＆プロフィール取得済みならアプリ本体をレンダー
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard profile={profile} />} />
        <Route
          path="/group/:groupId"
          element={<GroupManagement profile={profile} />}
        />
        <Route
          path="/assignment/:assignmentId"
          element={<AssignmentDetail profile={profile} />}
        />
        <Route
          path="/group/:groupId/new-assignment"
          element={<AssignmentEdit profile={profile} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
