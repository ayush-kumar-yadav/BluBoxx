import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SERVER_URL } from '../config.js';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '@bluboxx/shared';
import type { QuestionSummary } from '@bluboxx/shared';
import { Button } from '../components/ui/button.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { cn } from '../lib/utils.js';

function interviewerTokenKey(roomId: string): string {
  return `bluboxx:interviewerToken:${roomId}`;
}

export default function Home() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>(DEFAULT_LANGUAGE);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchQuestions = useCallback(() => {
    setLoadingQuestions(true);
    setLoadError(null);
    fetch(`${SERVER_URL}/api/questions`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        return res.json();
      })
      .then((data: QuestionSummary[]) => {
        setQuestions(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load questions'))
      .finally(() => setLoadingQuestions(false));
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  async function handleCreateRoom() {
    if (!selectedId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: selectedLanguage, questionId: selectedId }),
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
    <div className="relative min-h-screen bg-hero-bg bg-doc-grid overflow-hidden">
      {/* Restrained radial glow anchored to the interactive card below, not
          spread across the whole page - the one place we spend the accent. */}
      <div
        className="pointer-events-none absolute -left-40 top-1/3 h-[36rem] w-[36rem] rounded-full bg-primary/10 blur-[120px]"
        aria-hidden
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-12">
        <span className="text-lg font-semibold tracking-tight">BluBoxx</span>
        <span className="hidden items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs text-muted-foreground md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Custom-built CRDT engine
        </span>
      </header>

      <main className="relative z-10 mx-auto flex max-w-5xl flex-col px-6 pb-20 pt-10 md:px-12 md:pt-16">
        <h1
          className="mb-4 max-w-2xl text-[clamp(2.25rem,5.5vw,4rem)] font-bold leading-[1.08] tracking-tight opacity-0 animate-fade-up"
          style={{ animationDelay: '0.1s' }}
        >
          Code interviews, synced instantly.
        </h1>
        <p
          className="mb-12 max-w-md text-[clamp(0.95rem,1.4vw,1.1rem)] font-light leading-relaxed text-muted-foreground opacity-0 animate-fade-up"
          style={{ animationDelay: '0.25s' }}
        >
          Candidate and interviewer edit, run, and review the same document in
          real time. Pick a question, create a room, share the link.
        </p>

        <div
          className="w-full max-w-md rounded-lg border border-border bg-secondary/40 p-6 opacity-0 animate-fade-up backdrop-blur-sm"
          style={{ animationDelay: '0.4s' }}
        >
          {loadError && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button variant="outline" size="sm" onClick={fetchQuestions}>
                Retry
              </Button>
            </div>
          )}

          {loadingQuestions && !loadError && (
            <div className="mb-5 space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {!loadingQuestions && questions.length > 0 && (
            <div className="mb-5">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Question</label>
              <SelectField value={selectedId} onChange={setSelectedId}>
                {questions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title} ({q.difficulty})
                  </option>
                ))}
              </SelectField>
            </div>
          )}

          <div className="mb-6">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Starting language</label>
            <SelectField value={selectedLanguage} onChange={setSelectedLanguage}>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.label}
                </option>
              ))}
            </SelectField>
            <p className="mt-1.5 text-xs text-muted-foreground/70">Either side can switch languages later.</p>
          </div>

          <Button
            variant="primary"
            size="lg"
            className="w-full uppercase tracking-wide"
            onClick={handleCreateRoom}
            disabled={creating || !selectedId || loadingQuestions}
          >
            {creating ? 'Creating…' : 'Create interview room'}
          </Button>
          {createError && <p className="mt-3 text-sm text-destructive">{createError}</p>}
        </div>
      </main>
    </div>
  );
}

function SelectField({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full rounded-md border border-border bg-secondary px-3 py-2.5 text-sm text-foreground',
        'outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/20',
      )}
    >
      {children}
    </select>
  );
}