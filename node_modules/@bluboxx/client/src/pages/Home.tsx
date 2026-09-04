import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SERVER_URL } from '../config.js';
import type { QuestionSummary } from '@bluboxx/shared';

function interviewerTokenKey(roomId: string): string {
  return `bluboxx:interviewerToken:${roomId}`;
}

export default function Home() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/questions`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        return res.json();
      })
      .then((data: QuestionSummary[]) => {
        setQuestions(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load questions'));
  }, []);

  async function handleCreateRoom() {
    if (!selectedId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: 'javascript', questionId: selectedId }),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = (await res.json()) as { roomId: string; interviewerToken: string };

      // Only the creator's browser ever stores this - it's what proves
      // "I'm the interviewer" when this tab later joins the room's socket.
      localStorage.setItem(interviewerTokenKey(data.roomId), data.interviewerToken);

      navigate(`/room/${data.roomId}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: 600, margin: '0 auto' }}>
      <h1>BluBoxx</h1>
      <p style={{ color: '#666' }}>
        Pick a question, create a room, then share the link with your candidate. Whoever creates
        the room is the interviewer - anyone else who opens the link joins as the candidate.
      </p>

      {loadError && <p style={{ color: '#c0392b' }}>{loadError}</p>}

      {questions.length > 0 && (
        <div style={{ margin: '1rem 0' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: '0.4rem' }}>
            Question
          </label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              fontSize: 14,
              borderRadius: 6,
              border: '1px solid #ccc',
            }}
          >
            {questions.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title} ({q.difficulty})
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        onClick={handleCreateRoom}
        disabled={creating || !selectedId}
        style={{
          padding: '0.6rem 1.2rem',
          fontSize: 14,
          borderRadius: 6,
          border: 'none',
          background: '#111',
          color: '#fff',
          cursor: creating || !selectedId ? 'default' : 'pointer',
          opacity: creating || !selectedId ? 0.6 : 1,
        }}
      >
        {creating ? 'Creating...' : 'Create Interview Room'}
      </button>
      {createError && <p style={{ color: '#c0392b', marginTop: '0.75rem' }}>{createError}</p>}
    </div>
  );
}