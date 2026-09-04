import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCollaborativeEditor } from '../collab/useCollaborativeEditor.js';
import { SERVER_URL } from '../config.js';
import type { QuestionDetail, RunResult } from '@bluboxx/shared';

interface RoomInfo {
  roomId: string;
  language: string;
  question: QuestionDetail;
}

function interviewerTokenKey(roomId: string): string {
  return `bluboxx:interviewerToken:${roomId}`;
}

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [notFound, setNotFound] = useState(false);

  const interviewerToken = roomId ? localStorage.getItem(interviewerTokenKey(roomId)) : null;

  const { containerRef, role, connected, running, runResult, runCode, notes, updateNotes } = useCollaborativeEditor(
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
  const question = roomInfo?.question;

  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ margin: 0 }}>{question?.title ?? 'BluBoxx'}</h1>
          {question && <DifficultyBadge difficulty={question.difficulty} />}
        </div>
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

      {question && <QuestionPanel question={question} />}

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginTop: '1rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
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
        </div>

        {role === 'interviewer' && <NotesPanel notes={notes} onChange={updateNotes} />}
      </div>
    </div>
  );
}

function QuestionPanel({ question }: { question: QuestionDetail }) {
  return (
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: 6,
        padding: '1rem',
        background: '#fafafa',
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <p style={{ margin: '0 0 0.75rem' }}>{question.description}</p>
      {question.examples.map((ex, i) => (
        <div key={i} style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13, marginBottom: '0.3rem' }}>
          <strong>Example {i + 1}:</strong> {question.functionName}({ex.input.map((v) => JSON.stringify(v)).join(', ')})
          {' → '}
          {JSON.stringify(ex.expectedOutput)}
        </div>
      ))}
      {question.hiddenTestCount > 0 && (
        <p style={{ margin: '0.5rem 0 0', color: '#888', fontSize: 12 }}>
          + {question.hiddenTestCount} hidden test case{question.hiddenTestCount === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}

function NotesPanel({ notes, onChange }: { notes: string; onChange: (text: string) => void }) {
  return (
    <div style={{ width: 260, flexShrink: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: '0.4rem' }}>
        Private notes (only you can see this)
      </div>
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Jot feedback as you go - the candidate never sees this panel or its contents."
        style={{
          width: '100%',
          minHeight: 300,
          padding: '0.6rem',
          fontSize: 13,
          fontFamily: 'system-ui',
          border: '1px solid #ddd',
          borderRadius: 6,
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
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

function DifficultyBadge({ difficulty }: { difficulty: 'Easy' | 'Medium' | 'Hard' }) {
  const color = difficulty === 'Easy' ? '#2e7d32' : difficulty === 'Medium' ? '#e65100' : '#c62828';
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color, marginLeft: '0.5rem' }}>{difficulty}</span>
  );
}

function OutputPanel({ running, result }: { running: boolean; result: RunResult | null }) {
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