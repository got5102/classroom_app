// src/pages/AssignmentDetail.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function AssignmentDetail({ profile }) {
    const { assignmentId } = useParams();
    const [assignment, setAssignment] = useState(null);
    const [submissions, setSubmissions] = useState([]);  // for teacher: list of students' results
    const [code, setCode] = useState('');
    const [language, setLanguage] = useState('python');
    const [resultMessage, setResultMessage] = useState('');
    const [compileError, setCompileError] = useState('');
    const [solved, setSolved] = useState(false);

    useEffect(() => {
        if (!assignmentId) return;
        // Fetch assignment details
        supabase.from('assignments')
            .select('title, description, code_example, output_example, input_filename, output_mode, output_filename, due_date, created_by')
            .eq('id', assignmentId).single()
            .then(({ data }) => {
                if (data) setAssignment(data);
            });
        if (profile?.role === 'student') {
            // Check if the student already solved it
            supabase.from('submissions')
                .select('id').eq('assignment_id', assignmentId).eq('student_id', profile.id).eq('passed', true)
                .then(({ data }) => {
                    if (data && data.length > 0) setSolved(true);
                });
        }
        if (profile?.role === 'teacher') {
            // Teacher: fetch all student submissions for this assignment
            supabase.from('submissions')
                .select('student_id, passed, score').eq('assignment_id', assignmentId)
                .then(async ({ data: subs }) => {
                    if (subs) {
                        // fetch student names from profiles
                        const studentIds = subs.map(s => s.student_id);
                        let nameMap = {};
                        if (studentIds.length > 0) {
                            const { data: profilesData } = await supabase.from('profiles').select('id, name').in('id', studentIds);
                            if (profilesData) {
                                profilesData.forEach(p => { nameMap[p.id] = p.name; });
                            }
                        }
                        // fetch total number of test cases for this assignment (for scoring info)
                        const { data: tests } = await supabase.from('test_cases').select('id').eq('assignment_id', assignmentId);
                        const totalTests = tests ? tests.length : 0;
                        // prepare submissions list with names and scores
                        const resultsList = subs.map(s => ({
                            studentName: nameMap[s.student_id] || '(ID:' + s.student_id + ')',
                            scoreText: totalTests ? `${s.score}/${totalTests} tests passed` : (s.passed ? 'Passed all tests' : `${s.score} tests passed`)
                        }));
                        setSubmissions(resultsList);
                    }
                });
        }
    }, [assignmentId, profile]);

    const handleRunCode = async () => {
        setResultMessage(''); setCompileError('');
        // Prepare request to code runner service
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const response = await fetch(process.env.REACT_APP_RUNNER_URL + '/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
            body: JSON.stringify({ assignmentId, language, code })
        });
        const result = await response.json();
        if (result.error) {
            // Compile or execution error
            setCompileError(result.error);
        } else if (result.score !== undefined) {
            // Received test results
            const { score, total } = result;
            if (score === total) {
                setResultMessage(`All ${total} tests passed!`);
                setSolved(true);
            } else {
                setResultMessage(`Passed ${score} out of ${total} tests.`);
            }
        }
        // (We could refresh the submissions list for teacher here, but it's not critical to do immediately)
    };

    if (!assignment) {
        return <div className="p-4">Loading...</div>;
    }

    const isTeacher = profile?.role === 'teacher';
    const now = new Date();
    const due = assignment.due_date ? new Date(assignment.due_date) : null;
    const afterDue = due ? now > due : false;
    const showSolution = isTeacher || afterDue || solved;

    return (
        <div className="max-w-2xl mx-auto p-4">
            <h2 className="text-2xl font-bold mb-2">{assignment.title}</h2>
            {assignment.description && <p className="mb-4 whitespace-pre-line">{assignment.description}</p>}
            {isTeacher && (
                <p className="mb-4 text-sm text-gray-600">* You are viewing as teacher. Students will not see the solution until after due date or solving the assignment.</p>
            )}
            {assignment.input_filename && assignment.output_mode === 'file' && (
                <p className="mb-4 text-gray-700">**Input file:** {assignment.input_filename} (will be available in the execution environment)</p>
            )}
            {!isTeacher && assignment.output_mode === 'file' && (
                <p className="mb-4 text-gray-700">Your program should write the result to file <code>{assignment.output_filename || 'output.txt'}</code>.</p>
            )}
            {!isTeacher && assignment.output_mode === 'stdout' && (
                <p className="mb-4 text-gray-700">Your program should print the result to standard output.</p>
            )}

            {profile?.role === 'student' && (
                <div className="mb-6">
                    {/* Student code editor and run */}
                    <label className="block font-medium mb-1">Your Code:</label>
                    <textarea
                        className="w-full h-40 px-3 py-2 border font-mono rounded mb-2"
                        value={code} onChange={e => setCode(e.target.value)}
                        placeholder="Write your solution code here..."
                    />
                    <div className="mb-2">
                        <label className="font-medium mr-2">Language:</label>
                        <select value={language} onChange={e => setLanguage(e.target.value)} className="border px-2 py-1">
                            <option value="python">Python</option>
                            <option value="cpp">C++</option>
                            <option value="java">Java</option>
                        </select>
                    </div>
                    <button onClick={handleRunCode} className="bg-blue-600 text-white px-4 py-2 rounded">Run Code</button>
                    {compileError && <pre className="bg-red-100 text-red-700 p-2 mt-3 whitespace-pre-wrap">{compileError}</pre>}
                    {resultMessage && <p className="mt-3 font-semibold">{resultMessage}</p>}
                </div>
            )}

            {/* Solution reveal (for students after due/solved, or always for teacher) */}
            {showSolution && assignment.code_example && (
                <div className="bg-gray-100 p-3 rounded mb-6">
                    <h3 className="font-semibold mb-2">Solution Example:</h3>
                    <pre className="whitespace-pre-wrap text-sm mb-2"><code>{assignment.code_example}</code></pre>
                    {assignment.output_example && (
                        <div>
                            <div className="font-medium">Expected Output:</div>
                            <pre className="whitespace-pre-wrap text-sm"><code>{assignment.output_example}</code></pre>
                        </div>
                    )}
                </div>
            )}

            {/* Teacher view of student submissions */}
            {isTeacher && (
                <div>
                    <h3 className="text-xl font-semibold mb-2">Student Submissions</h3>
                    {submissions.length === 0 ? (
                        <p>No submissions yet.</p>
                    ) : (
                        <ul className="list-disc list-inside">
                            {submissions.map((s, idx) => (
                                <li key={idx}>
                                    {s.studentName}: {s.scoreText}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

export default AssignmentDetail;
