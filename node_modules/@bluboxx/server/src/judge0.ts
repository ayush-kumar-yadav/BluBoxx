import type { RunResult } from '@bluboxx/shared';

// Judge0's language IDs for the languages BluBoxx supports. Extend this if
// you add more languages to the room-creation form.
const LANGUAGE_IDS: Record<string, number> = {
  javascript: 63, // Node.js
  typescript: 74,
  python: 71, // Python 3
  java: 62,
  cpp: 54, // C++ (GCC 9.2.0)
  c: 50,
};

function toBase64(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64');
}

function fromBase64(text: string | null | undefined): string | null {
  if (!text) return null;
  return Buffer.from(text, 'base64').toString('utf-8');
}

/**
 * Runs `code` via Judge0 and returns a normalized result. Uses the
 * synchronous (`wait=true`) submission endpoint - fine for short interview
 * snippets; a long-running submission would need the async
 * submit-then-poll flow instead, which isn't needed at this project's scope.
 *
 * Defaults to the free public ce.judge0.com instance (no key required,
 * but rate-limited) so this works out of the box locally. For production,
 * set JUDGE0_API_URL to your own instance plus ONE of:
 *   - JUDGE0_API_KEY: for a RapidAPI-hosted instance (sends X-RapidAPI-Key/Host)
 *   - JUDGE0_AUTH_TOKEN: for a self-hosted instance with AUTHN_TOKEN set
 *     (sends X-Auth-Token) - see DEPLOYMENT.md for the VPS setup this pairs with.
 */
export async function runCode(code: string, language: string, stdin = ''): Promise<RunResult> {
  const languageId = LANGUAGE_IDS[language] ?? LANGUAGE_IDS.javascript;
  const baseUrl = process.env.JUDGE0_API_URL ?? 'https://ce.judge0.com';
  const rapidApiKey = process.env.JUDGE0_API_KEY;
  const selfHostedToken = process.env.JUDGE0_AUTH_TOKEN;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (rapidApiKey) {
    headers['X-RapidAPI-Key'] = rapidApiKey;
    headers['X-RapidAPI-Host'] = new URL(baseUrl).host;
  } else if (selfHostedToken) {
    headers['X-Auth-Token'] = selfHostedToken;
  }

  const res = await fetch(`${baseUrl}/submissions?base64_encoded=true&wait=true`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      source_code: toBase64(code),
      language_id: languageId,
      stdin: toBase64(stdin),
    }),
  });

  if (!res.ok) {
    throw new Error(`Judge0 request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    stdout: string | null;
    stderr: string | null;
    compile_output: string | null;
    status?: { description?: string };
    time: string | null;
    memory: number | null;
  };

  return {
    stdout: fromBase64(data.stdout),
    stderr: fromBase64(data.stderr),
    compileOutput: fromBase64(data.compile_output),
    statusDescription: data.status?.description ?? 'Unknown',
    time: data.time,
    memory: data.memory,
  };
}