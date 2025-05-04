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
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null); // user profile with role

    useEffect(() => {
        // Check initial auth state
        supabase.auth.getSession().then(({ data: { session } }) => {
            const user = session?.user || null;
            setUser(user);
            if (user) loadProfile(user.id);
        });
        // Subscribe to auth changes (login, logout)
        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            const user = session?.user || null;
            setUser(user);
            if (user) {
                loadProfile(user.id);
            } else {
                setProfile(null);
            }
        });
        return () => { listener.subscription.unsubscribe(); }
    }, []);

    const loadProfile = async (userId) => {
        // Fetch profile info (name and role)
        let { data, error } = await supabase.from('profiles').select('name, role').eq('id', userId).single();
        if (data) {
            // include the id for convenience
            setProfile({ ...data, id: userId });
        }
    };

    if (!user) {
        return <LoginPage />; // not logged in, show login
    }

    // If user is logged in, render the app routes
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Dashboard profile={profile} />} />
                <Route path="/group/:groupId" element={<GroupManagement profile={profile} />} />
                <Route path="/assignment/:assignmentId" element={<AssignmentDetail profile={profile} />} />
                <Route path="/group/:groupId/new-assignment" element={<AssignmentEdit profile={profile} />} />
                <Route path="*" element={<Navigate to="/" />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
