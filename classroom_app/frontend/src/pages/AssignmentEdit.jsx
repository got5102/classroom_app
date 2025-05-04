// src/pages/AssignmentEdit.jsx
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function AssignmentEdit({ profile }) {
    const { groupId } = useParams();
    const navigate = useNavigate();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [outputMode, setOutputMode] = useState('stdout');
    const [outputFile, setOutputFile] = useState('output.txt');
    const [codeExample, setCodeExample] = useState('');
    const [outputExample, setOutputExample] = useState('');
    const [testCases, setTestCases] = useState([{ input: '', output: '' }]);
    const [error, setError] = useState(null);

    const addTestCase = () => {
        setTestCases([...testCases, { input: '', output: '' }]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        // Insert new assignment
        const { data: assignment, error: assignError } = await supabase.from('assignments')
            .insert({
                group_id: groupId,
                title,
                description,
                code_example: codeExample,
                output_example: outputExample,
                input_filename: outputMode === 'file' ? (outputFile || 'input.txt') : 'input.txt',
                output_mode: outputMode,
                output_filename: outputMode === 'file' ? outputFile : null,
                due_date: dueDate ? new Date(dueDate).toISOString() : null,
                created_by: profile.id
            }).select().single();
        if (assignError) {
            setError(assignError.message);
            return;
        }
        // Insert test cases
        if (assignment) {
            const casesData = testCases.map(tc => ({
                assignment_id: assignment.id,
                input_data: tc.input,
                expected_output: tc.output
            }));
            const { error: casesError } = await supabase.from('test_cases').insert(casesData);
            if (casesError) {
                setError('Assignment created, but error adding test cases: ' + casesError.message);
            }
            // Navigate back to group page
            navigate(`/group/${groupId}`);
        }
    };

    if (profile?.role !== 'teacher') {
        return <div className="p-4">Unauthorized</div>;
    }

    return (
        <div className="max-w-2xl mx-auto p-4">
            <h2 className="text-xl font-bold mb-4">New Assignment</h2>
            <form onSubmit={handleSubmit}>
                <div className="mb-3">
                    <label className="block font-medium">Title:</label>
                    <input
                        type="text" value={title} onChange={e => setTitle(e.target.value)}
                        required className="w-full px-3 py-2 border rounded"
                    />
                </div>
                <div className="mb-3">
                    <label className="block font-medium">Description:</label>
                    <textarea
                        value={description} onChange={e => setDescription(e.target.value)}
                        className="w-full px-3 py-2 border rounded"
                    />
                </div>
                <div className="mb-3">
                    <label className="block font-medium">Due Date:</label>
                    <input
                        type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)}
                        className="px-3 py-2 border rounded"
                    />
                </div>
                <div className="mb-3">
                    <label className="block font-medium">Output Mode:</label>
                    <label className="mr-4">
                        <input
                            type="radio" name="outputMode" value="stdout" checked={outputMode === 'stdout'}
                            onChange={() => setOutputMode('stdout')}
                        /> Standard Output
                    </label>
                    <label>
                        <input
                            type="radio" name="outputMode" value="file" checked={outputMode === 'file'}
                            onChange={() => setOutputMode('file')}
                        /> File Output
                    </label>
                </div>
                {outputMode === 'file' && (
                    <div className="mb-3">
                        <label className="block font-medium">Output File Name:</label>
                        <input
                            type="text" value={outputFile} onChange={e => setOutputFile(e.target.value)}
                            className="px-3 py-2 border rounded"
                        />
                    </div>
                )}
                <div className="mb-3">
                    <label className="block font-medium">Solution Code (optional):</label>
                    <textarea
                        value={codeExample} onChange={e => setCodeExample(e.target.value)}
                        className="w-full h-24 px-3 py-2 border rounded font-mono"
                        placeholder="Solution code (if provided, shown after due date)"
                    />
                </div>
                <div className="mb-3">
                    <label className="block font-medium">Output Example (optional):</label>
                    <textarea
                        value={outputExample} onChange={e => setOutputExample(e.target.value)}
                        className="w-full px-3 py-2 border rounded font-mono"
                        placeholder="Expected output from solution (optional)"
                    />
                </div>
                <div className="mb-3">
                    <label className="block font-medium mb-1">Test Cases:</label>
                    {testCases.map((tc, idx) => (
                        <div key={idx} className="mb-2 pl-4 border-l">
                            <div>Test Case {idx + 1}</div>
                            <input
                                type="text" placeholder="Input data" value={tc.input}
                                onChange={e => {
                                    const newCases = [...testCases];
                                    newCases[idx].input = e.target.value;
                                    setTestCases(newCases);
                                }}
                                className="w-full mb-1 px-2 py-1 border rounded"
                            />
                            <input
                                type="text" placeholder="Expected output" value={tc.output}
                                onChange={e => {
                                    const newCases = [...testCases];
                                    newCases[idx].output = e.target.value;
                                    setTestCases(newCases);
                                }}
                                className="w-full px-2 py-1 border rounded"
                            />
                        </div>
                    ))}
                    <button type="button" onClick={addTestCase} className="text-blue-600 text-sm">+ Add another test case</button>
                </div>
                {error && <p className="text-red-500 mb-3">{error}</p>}
                <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded">Create Assignment</button>
            </form>
        </div>
    );
}

export default AssignmentEdit;
