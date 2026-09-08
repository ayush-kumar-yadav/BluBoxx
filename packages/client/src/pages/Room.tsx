import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCollaborativeEditor } from '../collab/useCollaborativeEditor.js';
import type { Participant, TimerState } from '../collab/useCollaborativeEditor.js';
import { colorForSite } from '../collab/cursorPresence.js';
import { useAuth, authHeader } from '../lib/auth.js';
import { SERVER_URL } from '../config.js';
import { SUPPORTED_LANGUAGES } from '@bluboxx/shared';
import type { QuestionDetail, RunResult, TestRunSummary } from '@bluboxx/shared';
import { Button } from '../components/ui/button.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { cn } from '../lib/utils.js';

interface RoomInfo {
  roomId: string;
  language: string;
  question: QuestionDetail;
}

interface CompletedRating {
  score: number;
  feedback: string | null;
}

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const { token } = useAuth();
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showRatingPanel, setShowRatingPanel] = useState(false);
  const [completedRating, setCompletedRating] = useState<CompletedRating | null>(null);

  const {
    containerRef,
    role,
    connected,
    connectionStatus,
    docReady,
    running,
    runResult,
    runCode,
    runningTests,
    testSummary,
    testsUnsupportedLanguage,
    runTests,
    notes,
    updateNotes,
    language,
    changeLanguage,
    participants,
    mySiteId,
    timer,
    startTimer,
    pauseTimer,
    resetTimer,
    setTimerDuration,
  } = useCollaborativeEditor(roomId ?? '', token);

  useEffect(() => {
    if (!roomId) return;
    fetch(`${SERVER_URL}/api/rooms/${roomId}`, { headers: authHeader(token) })
      .then((res) => {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then(setRoomInfo)
      .catch(() => setNotFound(true));
  }, [roomId, token]);

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

        <span className="hidden h-4 w-px bg-border md:inline" />
        <TimerWidget timer={timer} role={role} onStart={startTimer} onPause={pauseTimer} onReset={resetTimer} onSetDuration={setTimerDuration} />

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
            {role === 'interviewer' && !completedRating && (
              <Button variant="outline" size="sm" onClick={() => setShowRatingPanel((v) => !v)}>
                {showRatingPanel ? 'Cancel rating' : 'Rate & complete'}
              </Button>
            )}
            <LanguageSelect value={language} onChange={changeLanguage} disabled={!connected} />
            <Button variant="outline" size="sm" onClick={runTests} disabled={runningTests || !connected}>
              {runningTests ? 'Testing…' : '✓ Run Tests'}
            </Button>
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
          {completedRating && (
            <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
              ✓ Interview marked complete — rated {completedRating.score}/10.
            </div>
          )}

          {showRatingPanel && roomId && (
            <RatingPanel
              roomId={roomId}
              token={token}
              onSubmitted={(rating) => {
                setCompletedRating(rating);
                setShowRatingPanel(false);
              }}
              onCancel={() => setShowRatingPanel(false)}
            />
          )}

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
          <TestResultsPanel
            running={runningTests}
            summary={testSummary}
            unsupportedLanguage={testsUnsupportedLanguage}
          />
        </div>

        {role === 'interviewer' && <NotesPanel notes={notes} onChange={updateNotes} />}
      </div>
    </div>
  );
}

function RatingPanel({
  roomId,
  token,
  onSubmitted,
  onCancel,
}: {
  roomId: string;
  token: string | null;
  onSubmitted: (rating: CompletedRating) => void;
  onCancel: () => void;
}) {
  const [score, setScore] = useState(7);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/interviews/${roomId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({ score, feedback: feedback.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server responded ${res.status}`);
      }
      onSubmitted({ score, feedback: feedback.trim() || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit rating');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-4">
      <h3 className="mb-3 text-sm font-medium">Rate this candidate</h3>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Score: {score}/10</label>
      <input
        type="range"
        min={1}
        max={10}
        value={score}
        onChange={(e) => setScore(Number(e.target.value))}
        className="mb-4 w-full accent-primary"
      />

      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Feedback (optional)</label>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Strengths, gaps, notes for later reference…"
        className={cn(
          'mb-4 min-h-[80px] w-full resize-y rounded-md border border-border bg-secondary p-3 text-sm text-foreground',
          'placeholder:text-muted-foreground/60 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20',
        )}
      />

      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit rating'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function computeRemainingSeconds(timer: TimerState): number {
  if (timer.running && timer.endsAt) {
    return Math.max(0, Math.round((timer.endsAt - Date.now()) / 1000));
  }
  return timer.remainingSeconds;
}

const TIMER_DURATION_PRESETS = [15, 30, 45, 60].map((minutes) => ({
  label: `${minutes} min`,
  seconds: minutes * 60,
}));

function TimerWidget({
  timer,
  role,
  onStart,
  onPause,
  onReset,
  onSetDuration,
}: {
  timer: TimerState;
  role: 'interviewer' | 'candidate' | 'pending';
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onSetDuration: (seconds: number) => void;
}) {
  const [displaySeconds, setDisplaySeconds] = useState(() => computeRemainingSeconds(timer));

  // Re-derives from timer.endsAt (an absolute server timestamp) every
  // tick rather than counting down locally from a cached value - this is
  // what keeps the display correct across a brief disconnect/reconnect,
  // not just smooth while connected.
  useEffect(() => {
    setDisplaySeconds(computeRemainingSeconds(timer));
    if (!timer.running) return;
    const id = setInterval(() => setDisplaySeconds(computeRemainingSeconds(timer)), 250);
    return () => clearInterval(id);
  }, [timer]);

  const isTimeUp = displaySeconds <= 0;
  const minutes = Math.floor(displaySeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (displaySeconds % 60).toString().padStart(2, '0');

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'font-mono text-sm tabular-nums',
          isTimeUp ? 'font-medium text-destructive animate-pulse' : 'text-foreground',
        )}
      >
        {minutes}:{seconds}
      </span>

      {role === 'interviewer' && (
        <>
          <select
            value={timer.durationSeconds}
            onChange={(e) => onSetDuration(Number(e.target.value))}
            disabled={timer.running}
            aria-label="Timer duration"
            className={cn(
              'rounded-md border border-border bg-secondary px-2 py-1 text-xs text-foreground outline-none',
              'focus:border-primary/50 focus:ring-2 focus:ring-primary/20',
              timer.running && 'cursor-default opacity-60',
            )}
          >
            {TIMER_DURATION_PRESETS.map((preset) => (
              <option key={preset.seconds} value={preset.seconds}>
                {preset.label}
              </option>
            ))}
          </select>
          {timer.running ? (
            <Button variant="outline" size="sm" onClick={onPause}>
              Pause
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onStart} disabled={displaySeconds <= 0}>
              Start
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onReset}>
            Reset
          </Button>
        </>
      )}
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

function TestResultsPanel({
  running,
  summary,
  unsupportedLanguage,
}: {
  running: boolean;
  summary: TestRunSummary | null;
  unsupportedLanguage: string | null;
}) {
  if (!running && !summary && !unsupportedLanguage) return null;

  if (unsupportedLanguage) {
    const label = SUPPORTED_LANGUAGES.find((l) => l.id === unsupportedLanguage)?.label ?? unsupportedLanguage;
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-400">
        Auto-grading isn't available for {label} yet — it works for JavaScript, TypeScript, and Python. Use manual
        rating for this language instead.
      </div>
    );
  }

  if (running) {
    return (
      <div className="rounded-lg border border-border bg-black/60 p-3 font-mono text-[13px] text-muted-foreground">
        Running tests…
      </div>
    );
  }

  if (!summary) return null;

  const allPassed = summary.passedCount === summary.totalCount;

  return (
    <div className="rounded-lg border border-border bg-black/60 p-3 font-mono text-[13px] leading-relaxed">
      <div className={cn('mb-2 font-medium', allPassed ? 'text-primary' : 'text-amber-400')}>
        {summary.passedCount} / {summary.totalCount} tests passed
      </div>
      <div className="space-y-2">
        {summary.results.map((result, i) => (
          <div key={i} className="border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
            <div className={cn('flex items-center gap-2', result.passed ? 'text-primary' : 'text-destructive')}>
              <span>{result.passed ? '✓' : '✗'}</span>
              <span>
                Test {i + 1}
                {result.isHidden ? ' (hidden)' : ''}
              </span>
            </div>
            {result.input !== undefined && (
              <div className="mt-1 pl-5 text-muted-foreground">
                <div>Input: {JSON.stringify(result.input)}</div>
                <div>Expected: {JSON.stringify(result.expectedOutput)}</div>
                {!result.passed && 'actualOutput' in result && (
                  <div className="text-destructive">Got: {JSON.stringify(result.actualOutput)}</div>
                )}
                {result.error && <div className="text-destructive">{result.error}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
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
          title={`${p.name} · ${p.role === 'interviewer' ? 'Interviewer' : 'Candidate'}${p.siteId === mySiteId ? ' (you)' : ''}`}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-hero-bg text-[10px] font-semibold text-white"
          style={{ backgroundColor: colorForSite(p.siteId) }}
        >
          {p.name.trim().charAt(0).toUpperCase() || (p.role === 'interviewer' ? 'I' : 'C')}
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