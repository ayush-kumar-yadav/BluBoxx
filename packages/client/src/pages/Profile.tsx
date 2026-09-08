import { useEffect, useState } from 'react';
import { useAuth, authHeader } from '../lib/auth.js';
import { SERVER_URL } from '../config.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { Button } from '../components/ui/button.js';
import { cn } from '../lib/utils.js';

interface HistoryEntry {
  roomId: string;
  questionTitle: string;
  language: string;
  status: 'in_progress' | 'completed';
  score: number | null;
  feedback: string | null;
  role: 'interviewer' | 'candidate';
  counterpartName: string;
  createdAt: string;
  completedAt: string | null;
}

interface Stats {
  interviewsGiven: number;
  interviewsTaken: number;
  averageScoreReceived: number | null;
  history: HistoryEntry[];
}

export default function Profile() {
  const { user, token, logout } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/users/me/stats`, { headers: authHeader(token) })
      .then((res) => {
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        return res.json();
      })
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load profile'));
  }, [token]);

  return (
    <div className="min-h-screen bg-hero-bg px-6 py-10 text-foreground md:px-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">{user?.name}</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <Button variant="outline" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>

        {error && <p className="mb-6 text-sm text-destructive">{error}</p>}

        {!stats && !error && (
          <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {stats && (
          <>
            <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard label="Interviews given" value={stats.interviewsGiven} />
              <StatCard label="Interviews taken" value={stats.interviewsTaken} />
              <StatCard
                label="Avg. score received"
                value={stats.averageScoreReceived !== null ? stats.averageScoreReceived.toFixed(1) : '—'}
                suffix={stats.averageScoreReceived !== null ? '/10' : undefined}
              />
            </div>

            <h2 className="mb-3 text-sm font-medium text-muted-foreground">History</h2>
            {stats.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No interviews yet.</p>
            ) : (
              <div className="space-y-2">
                {stats.history.map((entry) => (
                  <HistoryRow key={entry.roomId} entry={entry} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, suffix }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4">
      <div className="text-2xl font-semibold">
        {value}
        {suffix && <span className="text-sm font-normal text-muted-foreground">{suffix}</span>}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const roleLabel = entry.role === 'interviewer' ? 'Interviewed' : 'Interviewed by';
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-sm font-medium">{entry.questionTitle}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {roleLabel} {entry.counterpartName} · {entry.language}
          </span>
        </div>
        {entry.status === 'completed' && entry.score !== null ? (
          <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
            {entry.score}/10
          </span>
        ) : (
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium',
              entry.role === 'interviewer' ? 'bg-secondary text-muted-foreground' : 'bg-amber-400/15 text-amber-400',
            )}
          >
            {entry.role === 'interviewer' ? 'Not yet rated' : 'Pending feedback'}
          </span>
        )}
      </div>
      {entry.feedback && <p className="mt-2 text-sm text-foreground/80">{entry.feedback}</p>}
    </div>
  );
}