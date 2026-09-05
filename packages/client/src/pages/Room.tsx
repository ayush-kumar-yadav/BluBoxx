import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCollaborativeEditor } from '../collab/useCollaborativeEditor.js';
import type { Participant } from '../collab/useCollaborativeEditor.js';
import { colorForSite } from '../collab/cursorPresence.js';
import { SERVER_URL } from '../config.js';
import { SUPPORTED_LANGUAGES } from '@bluboxx/shared';
import type { QuestionDetail, RunResult } from '@bluboxx/shared';
import { Button } from '../components/ui/button.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { cn } from '../lib/utils.js';

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

  const {
    containerRef,
    role,
    connected,
    connectionStatus,
    docReady,
    running,
    runResult,
    runCode,
    notes,
    updateNotes,
    language,
    changeLanguage,
    participants,
    mySiteId,
  } = useCollaborativeEditor(roomId ?? '', interviewerToken);

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
      <div className="min-h-screen bg-hero-bg px-6 py-16 text-foreground">
        <div className="mx-auto max-w-md text-center">
          <h1 className="mb-2 text-xl font-semibold">Room not found</h1>
          <p className="text-sm text-muted-foreground">
            This link may be wrong, or the server may have restarted — room state is in-memory for now.
          </p>
        </div>
      </div>
    );
  }

  const inviteLink = window.location.href;
  const question = roomInfo?.question;
  const isWaitingForCandidate =
    role === 'interviewer' && connected && !participants.some((p) => p.role === 'candidate');

  return (
    <div className="flex min-h-screen flex-col bg-hero-bg text-foreground">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-nav-button/40 px-4 py-3 md:px-6">
        <span className="text-sm font-semibold tracking-tight">BluBoxx</span>
        <span className="h-4 w-px bg-border" />
        {question ? (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium">{question.title}</span>
            <DifficultyBadge difficulty={question.difficulty} />
          </div>
        ) : (
          <Skeleton className="h-4 w-32" />
        )}

        <div className="ml-auto flex w-full flex-wrap items-center justify-between gap-3 md:w-auto md:justify-end">
          <div className="flex flex-wrap items-center gap-3">
            <ConnectionStatusIndicator status={connectionStatus} />
            <PresenceStack participants={participants} mySiteId={mySiteId} />
            {isWaitingForCandidate && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                Waiting for candidate…
              </span>
            )}
            <RoleBadge role={role} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {role === 'interviewer' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(inviteLink)}
              >
                Copy invite link
              </Button>
            )}
            <LanguageSelect value={language} onChange={changeLanguage} disabled={!connected} />
            <Button variant="primary" size="sm" onClick={() => runCode()} disabled={running || !connected}>
              {running ? 'Running…' : '▶ Run'}
            </Button>
          </div>
        </div>
      </div>

      {connectionStatus === 'reconnecting' && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-xs text-destructive md:px-6">
          Connection lost — reconnecting…
        </div>
      )}

      {/* Body */}
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-4 py-4 md:flex-row md:px-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {question ? <QuestionPanel question={question} /> : <QuestionPanelSkeleton />}

          <div className="relative min-h-[240px] flex-1 overflow-hidden rounded-lg border border-border md:min-h-[320px]">
            <div ref={containerRef} className="h-full" />
            {!docReady && (
              <div className="absolute inset-0 space-y-2 bg-[#1a1a1a] p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            )}
          </div>

          <OutputPanel running={running} result={runResult} />
        </div>

        {role === 'interviewer' && <NotesPanel notes={notes} onChange={updateNotes} />}
      </div>
    </div>
  );
}

function QuestionPanelSkeleton() {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-4">
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-5/6" />
      <Skeleton className="h-3.5 w-2/3" />
    </div>
  );
}

function QuestionPanel({ question }: { question: QuestionDetail }) {
  return (
    <div className="rounded-lg border border-border border-l-4 border-l-primary bg-secondary/30 p-4 text-sm leading-relaxed">
      <p className="mb-3 text-foreground/90">{question.description}</p>
      {question.examples.map((ex, i) => (
        <div key={i} className="mb-1 font-mono text-xs text-muted-foreground">
          <span className="text-foreground/70">Example {i + 1}:</span> {question.functionName}(
          {ex.input.map((v) => JSON.stringify(v)).join(', ')}) → {JSON.stringify(ex.expectedOutput)}
        </div>
      ))}
      {question.hiddenTestCount > 0 && (
        <p className="mt-2 text-xs text-muted-foreground/70">
          + {question.hiddenTestCount} hidden test case{question.hiddenTestCount === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}

function NotesPanel({ notes, onChange }: { notes: string; onChange: (text: string) => void }) {
  return (
    <div className="w-full flex-shrink-0 md:w-64">
      <div className="mb-2 text-xs font-medium text-muted-foreground">Private notes (only you can see this)</div>
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Jot feedback as you go — the candidate never sees this panel or its contents."
        className={cn(
          'min-h-[300px] w-full resize-y rounded-lg border border-border bg-secondary/40 p-3 text-sm text-foreground',
          'placeholder:text-muted-foreground/60 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20',
        )}
      />
    </div>
  );
}

function LanguageSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (language: string) => void;
  disabled: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Language"
      className={cn(
        'rounded-md border border-border bg-secondary px-2.5 py-1.5 text-xs text-foreground outline-none',
        'transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/20',
        disabled && 'cursor-default opacity-60',
      )}
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang.id} value={lang.id}>
          {lang.label}
        </option>
      ))}
    </select>
  );
}

function ConnectionStatusIndicator({ status }: { status: 'connecting' | 'connected' | 'reconnecting' }) {
  const config = {
    connected: { color: 'bg-primary', label: 'Connected' },
    connecting: { color: 'bg-amber-400 animate-pulse', label: 'Connecting…' },
    reconnecting: { color: 'bg-destructive animate-pulse', label: 'Reconnecting…' },
  }[status];
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn('h-1.5 w-1.5 rounded-full', config.color)} />
      {config.label}
    </span>
  );
}

function PresenceStack({ participants, mySiteId }: { participants: Participant[]; mySiteId: string }) {
  if (participants.length === 0) return null;
  return (
    <div className="flex items-center -space-x-2">
      {participants.map((p) => (
        <div
          key={p.siteId}
          title={`${p.role === 'interviewer' ? 'Interviewer' : 'Candidate'}${p.siteId === mySiteId ? ' (you)' : ''}`}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-hero-bg text-[10px] font-semibold text-white"
          style={{ backgroundColor: colorForSite(p.siteId) }}
        >
          {p.role === 'interviewer' ? 'I' : 'C'}
        </div>
      ))}
    </div>
  );
}

function RoleBadge({ role }: { role: 'interviewer' | 'candidate' | 'pending' }) {
  const label = role === 'pending' ? 'Joining…' : role === 'interviewer' ? 'Interviewer' : 'Candidate';
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-1 text-xs font-medium',
        role === 'interviewer' && 'bg-primary/15 text-primary',
        role === 'candidate' && 'bg-secondary text-foreground/80',
        role === 'pending' && 'bg-secondary text-muted-foreground',
      )}
    >
      {label}
    </span>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: 'Easy' | 'Medium' | 'Hard' }) {
  const color =
    difficulty === 'Easy' ? 'text-primary' : difficulty === 'Medium' ? 'text-amber-400' : 'text-destructive';
  return <span className={cn('text-xs font-medium', color)}>{difficulty}</span>;
}

function OutputPanel({ running, result }: { running: boolean; result: RunResult | null }) {
  if (!running && !result) return null;

  return (
    <div className="max-h-64 min-h-[70px] overflow-y-auto rounded-lg border border-border bg-black/60 p-3 font-mono text-[13px] leading-relaxed">
      {running && <div className="text-muted-foreground">Running…</div>}
      {!running && result && (
        <>
          <div className="mb-1.5 text-muted-foreground">{result.statusDescription}</div>
          {result.compileOutput && <div className="text-amber-400">{result.compileOutput}</div>}
          {result.stdout && <div className="whitespace-pre-wrap text-foreground">{result.stdout}</div>}
          {result.stderr && <div className="whitespace-pre-wrap text-destructive">{result.stderr}</div>}
          {!result.stdout && !result.stderr && !result.compileOutput && (
            <div className="text-muted-foreground">(no output)</div>
          )}
        </>
      )}
    </div>
  );
}