// src/pages/GroupManagement.jsx
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function GroupManagement({ profile }) {
    const { groupId } = useParams();
    const [group, setGroup] = useState(null);
    const [students, setStudents] = useState([]);
    const [assignments, setAssignments] = useState([]);

    useEffect(() => {
        if (!groupId || !profile || profile.role !== 'teacher') return;
        // Fetch group info
        supabase.from('groups').select('name, invite_code').eq('id', groupId).single()
            .then(({ data }) => setGroup(data));
        // Fetch students in the group
        supabase.from('group_members').select('user_id').eq('group_id', groupId)
            .then(async ({ data }) => {
                if (data) {
                    const userIds = data.map(m => m.user_id);
                    if (userIds.length > 0) {
                        const { data: profilesData } = await supabase.from('profiles').select('id, name').in('id', userIds);
                        if (profilesData) setStudents(profilesData);
                    } else {
                        setStudents([]);
                    }
                }
            });
        // Fetch assignments for this group
        supabase.from('assignments').select('id, title, due_date').eq('group_id', groupId)
            .then(({ data }) => {
                if (data) setAssignments(data);
            });
    }, [groupId, profile]);

    if (!group) {
        return <div className="p-4">Loading...</div>;
    }

    return (
        <div className="max-w-3xl mx-auto p-4">
            <h2 className="text-2xl font-bold mb-2">{group.name}</h2>
            <p className="mb-4 text-gray-700">Invite Code: <span className="font-mono">{group.invite_code}</span></p>
            <h3 className="text-xl font-semibold mb-2">Students</h3>
            <ul className="list-disc list-inside mb-4">
                {students.map(s => <li key={s.id}>{s.name}</li>)}
                {students.length === 0 && <li className="text-gray-500">No students have joined this group yet.</li>}
            </ul>
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-xl font-semibold">Assignments</h3>
                <Link
                    to={`/group/${groupId}/new-assignment`}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
                >
                    + New Assignment
                </Link>
            </div>
            <ul className="space-y-2">
                {assignments.map(a => (
                    <li key={a.id} className="p-3 bg-gray-100 rounded flex justify-between">
                        <span>{a.title}</span>
                        <Link to={`/assignment/${a.id}`} className="text-blue-600 underline">View</Link>
                    </li>
                ))}
                {assignments.length === 0 && <li className="text-gray-500">No assignments yet.</li>}
            </ul>
        </div>
    );
}

export default GroupManagement;
