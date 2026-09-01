import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SERVER_URL } from '../config.js';

function interviewerTokenKey(roomId: string): string {
  return `bluboxx:interviewerToken:${roomId}`;
}

export default function Home() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateRoom() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: 'javascript',
          questionTitle: 'Two Sum',
          starterCode: 'function twoSum(nums, target) {\n  \n}\n',
        }),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = (await res.json()) as { roomId: string; interviewerToken: string };

      // Only the creator's browser ever stores this - it's what proves
      // "I'm the interviewer" when this tab later joins the room's socket.
      localStorage.setItem(interviewerTokenKey(data.roomId), data.interviewerToken);

      navigate(`/room/${data.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: 600, margin: '0 auto' }}>
      <h1>BluBoxx</h1>
      <p style={{ color: '#666' }}>
        Create an interview room, then share the link with your candidate. Whoever creates the
        room is the interviewer - anyone else who opens the link joins as the candidate.
      </p>
      <button
        onClick={handleCreateRoom}
        disabled={creating}
        style={{
          padding: '0.6rem 1.2rem',
          fontSize: 14,
          borderRadius: 6,
          border: 'none',
          background: '#111',
          color: '#fff',
          cursor: creating ? 'default' : 'pointer',
          opacity: creating ? 0.6 : 1,
        }}
      >
        {creating ? 'Creating...' : 'Create Interview Room'}
      </button>
      {error && <p style={{ color: '#c0392b', marginTop: '0.75rem' }}>{error}</p>}
    </div>
  );
}