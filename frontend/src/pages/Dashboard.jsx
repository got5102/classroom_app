// src/pages/Dashboard.jsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function Dashboard({ profile }) {
    const [groups, setGroups] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [newGroupName, setNewGroupName] = useState('');
    const [joinCode, setJoinCode] = useState('');

    useEffect(() => {
        if (!profile) return;
        if (profile.role === 'teacher') {
            // Fetch groups owned by teacher
            supabase.from('groups').select('id, name, invite_code').then(({ data, error }) => {
                if (!error) setGroups(data);
            });
        } else {
            // Fetch assignments for student (RLS filters to their groups' assignments)
            const loadStudentData = async () => {
                const [{ data: assignData }, { data: groupData }] = await Promise.all([
                    supabase.from('assignments').select('id, title, due_date, group_id'),
                    supabase.from('groups').select('id, name')
                ]);
                if (assignData) {
                    if (groupData) {
                        const map = {};
                        groupData.forEach(g => { map[g.id] = g.name });
                        setAssignments(assignData.map(a => ({ ...a, groupName: map[a.group_id] || '' })));
                    } else {
                        setAssignments(assignData);
                    }
                }
            };
            loadStudentData();
        }
    }, [profile]);

    const handleCreateGroup = async () => {
        if (!newGroupName) return;
        // Generate a simple invite code
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const { data, error } = await supabase.from('groups').insert({
            name: newGroupName,
            invite_code: code,
            teacher_id: profile.id
        }).select().single();
        if (!error) {
            setGroups([...groups, data]);
            setNewGroupName('');
        }
    };

    const handleJoinGroup = async () => {
        if (!joinCode) return;
        const { data: group, error } = await supabase.from('groups').select('id').eq('invite_code', joinCode).single();
        if (group) {
            const { error: joinErr } = await supabase.from('group_members').insert({ group_id: group.id, user_id: profile.id });
            if (!joinErr) {
                // Refresh assignments after joining
                supabase.from('assignments').select('id, title, due_date, group_id').then(({ data }) => {
                    if (data) {
                        setAssignments(data); // RLS will include new group's assignments now
                    }
                });
                setJoinCode('');
            } else {
                alert('Error joining group: ' + joinErr.message);
            }
        } else {
            alert('No group found with that code');
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">
                {profile.role === 'teacher' ? 'My Classes' : 'My Assignments'}
            </h1>

            {profile.role === 'teacher' ? (
                <div>
                    {/* New Group form */}
                    <div className="mb-4 flex items-center space-x-2">
                        <input
                            type="text" placeholder="New Group Name" value={newGroupName}
                            onChange={e => setNewGroupName(e.target.value)}
                            className="px-3 py-2 border rounded flex-1"
                        />
                        <button
                            onClick={handleCreateGroup}
                            className="bg-green-600 text-white px-4 py-2 rounded"
                        >
                            Create Group
                        </button>
                    </div>
                    {/* Group tiles */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {groups.map(group => (
                            <Link to={`/group/${group.id}`} key={group.id} className="block bg-white rounded shadow p-4 hover:bg-gray-50">
                                <h2 className="text-xl font-semibold mb-1">{group.name}</h2>
                                <p className="text-sm text-gray-500">Invite Code: <span className="font-mono">{group.invite_code}</span></p>
                            </Link>
                        ))}
                    </div>
                </div>
            ) : (
                // Student view: join group form + assignment tiles
                <div>
                    {/* Join group form for students */}
                    <div className="mb-4 flex items-center space-x-2">
                        <input
                            type="text" placeholder="Enter Invite Code" value={joinCode}
                            onChange={e => setJoinCode(e.target.value)}
                            className="px-3 py-2 border rounded flex-1"
                        />
                        <button onClick={handleJoinGroup} className="bg-blue-600 text-white px-4 py-2 rounded">
                            Join Group
                        </button>
                    </div>
                    {/* Assignment tiles */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {assignments.length > 0 ? assignments.map(assign => (
                            <Link to={`/assignment/${assign.id}`} key={assign.id} className="block bg-white rounded shadow p-4 hover:bg-gray-50">
                                <h2 className="text-lg font-medium">{assign.title}</h2>
                                {assign.groupName && <p className="text-sm text-gray-600">Class: {assign.groupName}</p>}
                                {assign.due_date && <p className="text-sm">Due: {new Date(assign.due_date).toLocaleString()}</p>}
                            </Link>
                        )) : (
                            <p className="text-gray-600">No assignments yet.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Dashboard;
