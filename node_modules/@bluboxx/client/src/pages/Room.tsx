import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCollaborativeEditor } from '../collab/useCollaborativeEditor.js';
import { SERVER_URL } from '../config.js';

interface RoomInfo {
  roomId: string;
  language: string;
  questionTitle: string;
  starterCode: string;
}

function interviewerTokenKey(roomId: string): string {
  return `bluboxx:interviewerToken:${roomId}`;
}

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Only set if THIS browser created the room - proves interviewer status
  // to the server when joining the socket.
  const interviewerToken = roomId ? localStorage.getItem(interviewerTokenKey(roomId)) : null;

  const { containerRef, role, connected } = useCollaborativeEditor(roomId ?? '', interviewerToken);

  useEffect(() => {
    if (!roomId) return;
    fetch(`${SERVER_URL}/api/rooms/${roomId}`)
      .then((res) => {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then(setRoomInfo)
      .catch(() => setNotFound(true));
  }, [roomId]);

  if (notFound) {
    return (
      <div style={{ fontFamily: 'system-ui', padding: '2rem' }}>
        <h1>Room not found</h1>
        <p>This link may be wrong, or the server may have restarted (room state is in-memory for now).</p>
      </div>
    );
  }

  const inviteLink = window.location.href;

  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ margin: 0 }}>{roomInfo?.questionTitle ?? 'BluBoxx'}</h1>
        <RoleBadge role={role} />
      </div>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', margin: '0.75rem 0 1.25rem' }}>
        <span style={{ fontSize: 13, color: connected ? '#2e7d32' : '#c0392b' }}>
          {connected ? '● connected' : '○ disconnected'}
        </span>
        {role === 'interviewer' && (
          <button
            onClick={() => navigator.clipboard.writeText(inviteLink)}
            style={{
              fontSize: 12,
              padding: '0.3rem 0.6rem',
              borderRadius: 4,
              border: '1px solid #ccc',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            Copy invite link
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        style={{
          border: '1px solid #ddd',
          borderRadius: 6,
          minHeight: 300,
          fontSize: 14,
        }}
      />

      {/* TODO (Week 2 cont.): Run button + Judge0 output panel here.
          TODO (Week 2 cont.): interviewer-only private notes panel. */}
    </div>
  );
}

function RoleBadge({ role }: { role: 'interviewer' | 'candidate' | 'pending' }) {
  const label = role === 'pending' ? 'Joining...' : role === 'interviewer' ? 'Interviewer' : 'Candidate';
  const color = role === 'interviewer' ? '#1565c0' : role === 'candidate' ? '#6a1b9a' : '#999';
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: '#fff',
        background: color,
        padding: '0.25rem 0.6rem',
        borderRadius: 999,
      }}
    >
      {label}
    </span>
  );
}