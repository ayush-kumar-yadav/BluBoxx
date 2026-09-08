import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { Button } from '../components/ui/button.js';
import { FormField, authInputClass } from '../components/ui/form-field.js';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') ?? '/';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signup(email, password, name);
      navigate(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign up');
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
        <h1 className="mb-1 text-lg font-semibold">Create an account</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Used for both roles — the same account can interview or be interviewed.
        </p>

        {error && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <FormField label="Name">
          <input
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={authInputClass}
          />
        </FormField>
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
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authInputClass}
          />
          <p className="mt-1.5 text-xs text-muted-foreground/70">At least 8 characters.</p>
        </FormField>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="mt-2 w-full uppercase tracking-wide"
          disabled={submitting}
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Already have an account?{' '}
          <Link
            to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="text-primary hover:underline"
          >
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}