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

  const interviewerToken = roomId ? localStorage.getItem(interviewerTokenKey(roomId)) : null;

  const { containerRef, role, connected, running, runResult, runCode } = useCollaborativeEditor(
    roomId ?? '',
    interviewerToken,
  );

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
  const language = roomInfo?.language ?? 'javascript';

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
            style={buttonStyle('#fff', '#111', '1px solid #ccc')}
          >
            Copy invite link
          </button>
        )}
        <button
          onClick={() => runCode(language)}
          disabled={running || !connected}
          style={{
            ...buttonStyle('#111', '#fff', 'none'),
            marginLeft: 'auto',
            opacity: running || !connected ? 0.6 : 1,
            cursor: running || !connected ? 'default' : 'pointer',
          }}
        >
          {running ? 'Running...' : '▶ Run Code'}
        </button>
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

      <OutputPanel running={running} result={runResult} />

      {/* TODO (Week 2 cont.): interviewer-only private notes panel. */}
    </div>
  );
}

function buttonStyle(background: string, color: string, border: string): React.CSSProperties {
  return {
    fontSize: 12,
    padding: '0.4rem 0.8rem',
    borderRadius: 4,
    border,
    background,
    color,
  };
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

function OutputPanel({
  running,
  result,
}: {
  running: boolean;
  result: { stdout: string | null; stderr: string | null; compileOutput: string | null; statusDescription: string } | null;
}) {
  if (!running && !result) return null;

  return (
    <div
      style={{
        marginTop: '1rem',
        border: '1px solid #ddd',
        borderRadius: 6,
        background: '#0d1117',
        color: '#c9d1d9',
        padding: '0.75rem 1rem',
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: 13,
        whiteSpace: 'pre-wrap',
        minHeight: 60,
      }}
    >
      {running && <div style={{ color: '#8b949e' }}>Running...</div>}
      {!running && result && (
        <>
          <div style={{ color: '#8b949e', marginBottom: '0.4rem' }}>{result.statusDescription}</div>
          {result.compileOutput && <div style={{ color: '#f0883e' }}>{result.compileOutput}</div>}
          {result.stdout && <div>{result.stdout}</div>}
          {result.stderr && <div style={{ color: '#f85149' }}>{result.stderr}</div>}
          {!result.stdout && !result.stderr && !result.compileOutput && (
            <div style={{ color: '#8b949e' }}>(no output)</div>
          )}
        </>
      )}
    </div>
  );
}