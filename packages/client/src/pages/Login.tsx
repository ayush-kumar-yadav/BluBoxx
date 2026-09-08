import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { Button } from '../components/ui/button.js';
import { FormField, authInputClass } from '../components/ui/form-field.js';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log in');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-hero-bg bg-doc-grid px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-border bg-secondary/40 p-6 backdrop-blur-sm"
      >
        <h1 className="mb-1 text-lg font-semibold">Log in</h1>
        <p className="mb-6 text-sm text-muted-foreground">Welcome back to BluBoxx.</p>

        {error && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <FormField label="Email">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClass}
          />
        </FormField>
        <FormField label="Password">
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authInputClass}
          />
        </FormField>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="mt-2 w-full uppercase tracking-wide"
          disabled={submitting}
        >
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          No account?{' '}
          <Link
            to={`/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="text-primary hover:underline"
          >
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}