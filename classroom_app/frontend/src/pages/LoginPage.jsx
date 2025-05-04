// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        if (isSignUp) {
            // Sign up flow
            const { data: { user }, error: signUpError } = await supabase.auth.signUp({
                email,
                password
            });
            if (signUpError) {
                setError(signUpError.message);
            } else if (user) {
                // On successful sign-up, insert profile
                await supabase.from('profiles').insert({
                    id: user.id,
                    name,
                    role: 'student' // default role; adjust if needed for teachers
                });
                // Supabase auto-logs in the user after sign-up
            }
        } else {
            // Log in flow
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInError) {
                setError(signInError.message);
            }
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow-md w-80">
                <h2 className="text-xl font-bold mb-4 text-center">{isSignUp ? 'Sign Up' : 'Log In'}</h2>
                {isSignUp && (
                    <input
                        type="text" placeholder="Your Name" value={name}
                        onChange={e => setName(e.target.value)} required
                        className="mb-3 w-full px-3 py-2 border rounded"
                    />
                )}
                <input
                    type="email" placeholder="Email" value={email}
                    onChange={e => setEmail(e.target.value)} required
                    className="mb-3 w-full px-3 py-2 border rounded"
                />
                <input
                    type="password" placeholder="Password" value={password}
                    onChange={e => setPassword(e.target.value)} required
                    className="mb-4 w-full px-3 py-2 border rounded"
                />
                {error && <div className="text-red-500 text-sm mb-2">{error}</div>}
                <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded">
                    {isSignUp ? 'Sign Up' : 'Log In'}
                </button>
                <p className="mt-4 text-center text-sm">
                    {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                    <span
                        className="text-blue-600 cursor-pointer ml-1"
                        onClick={() => setIsSignUp(!isSignUp)}
                    >
                        {isSignUp ? 'Log In' : 'Sign Up'}
                    </span>
                </p>
            </form>
        </div>
    );
}

export default LoginPage;
