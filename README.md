# BluBoxx

A collaborative technical interview platform where candidates and interviewers
simultaneously edit, execute, and review code — synced in real time by a
custom-built CRDT (Replicated Growable Array), not a third-party library like
Yjs or ShareDB.

**Live demo:** https://blu-boxx-client-omega.vercel.app
**API:** https://bluboxx.onrender.com/health

> The API runs on Render's free tier, which spins down after ~15 minutes of
> inactivity — the first request after idle time can take up to 30 seconds
> while it wakes back up. This is expected, not a bug.

---

## Why this exists

Most "collaborative editor" side projects wrap an existing CRDT library and
call it done. BluBoxx implements the conflict-free merge algorithm itself
(`packages/shared/src/crdt.ts`) — tie-breaking, tombstoned deletes, op-log
replay for reconnecting clients — so the actually hard part (every replica
converging to the same document regardless of network order) is engineered
here, not imported.

## Features

- **Real-time collaborative editor** — CodeMirror 6 + a hand-written RGA CRDT,
  with a custom `remoteUpdate` annotation to prevent echo loops and full
  op-log replay on reconnect
- **Multi-language support** — JavaScript, TypeScript, Python, Java, C++, C.
  Either participant can switch languages mid-interview; the switch is
  server-authoritative and syncs both sides' syntax highlighting and Run
  Code target simultaneously
- **Code execution** via Judge0 — self-hosted locally via Docker for full
  control; the deployed demo points at Judge0's free public instance instead
  of a self-hosted VPS, a deliberate cost tradeoff documented in
  `DEPLOYMENT.md`
- **Hidden test-case grading** — runs a candidate's code against a question's
  full test suite (visible and hidden) via a generated per-language harness.
  Currently supports JavaScript, TypeScript, and Python (dynamically-typed
  languages the harness can call directly); Java/C++/C show a clear
  "not supported yet" message rather than pretending to grade, since that
  needs a type-aware code generator not yet built. Hidden test detail
  (input/expected/actual output) is redacted server-side per-socket before
  it ever reaches a candidate — not just hidden in the UI
- **Auth & profiles** — JWT-based signup/login, MongoDB-backed user accounts.
  The same account can be an interviewer in one room and a candidate in
  another; role is resolved per-room from whoever created it
- **Interview history & manual rating** — after an interview, the interviewer
  rates the candidate (1-10 + written feedback), recorded to that user's
  profile. Profile page shows interviews given, interviews taken, average
  score received, and full history
- **Live presence** — colored avatar stack showing who's actually connected
  to a room right now, with live cursor tracking as each person types
- **Interviewer-controlled countdown timer** — server-authoritative (an
  absolute end timestamp, not a naive per-client countdown), so it stays
  correct across a brief disconnect/reconnect for either participant
- **Private interviewer notes** — a panel only the interviewer's socket ever
  receives, enforced server-side via Socket.IO room membership, not just
  hidden in the client
- **Dark UI** — Sora + JetBrains Mono, custom Tailwind theme, loading
  skeletons and distinct connecting/connected/reconnecting states throughout

## Architecture

```
packages/
  shared/   CRDT engine + shared types & constants - imported identically by client & server
  server/   Express + Socket.IO + MongoDB/Mongoose - rooms, auth, grading, timer, presence
  client/   React + Vite + Tailwind + CodeMirror 6 - the interview room UI
```

Client and server both depend on `@bluboxx/shared`, so the CRDT merge logic
and the supported-languages list are never duplicated or allowed to drift
between the two.

**What's persisted vs. ephemeral, and why it matters:** user accounts and
completed `InterviewRecord`s (score, feedback, who interviewed whom) live in
MongoDB and survive a restart. Live room state — the op-log (i.e. the code
itself), presence, the countdown timer, and interviewer notes — lives in
plain in-memory `Map`s on the server process for simplicity, and does **not**
survive a server restart. On Render's free tier, an idle spin-down wipes any
room that was created before it. This is a deliberate scope cut for this
project's size, not an oversight — see the `TODO` comments in
`packages/server/src/rooms.ts` and `index.ts` for what a Redis/Mongo-backed
version of this would look like.

## Tech stack

React 18 + TypeScript + Vite · Tailwind CSS · CodeMirror 6 · Socket.IO ·
Node/Express · MongoDB + Mongoose · JWT + bcrypt · Judge0 (sandboxed code
execution)

`ioredis` is listed as a dependency from an earlier planned direction
(Redis-backed presence) but isn't actually wired into any code — presence
ended up implemented as in-memory `Map`s instead. Worth knowing if you're
reading the dependency list closely; it'll likely get removed or actually
used in a future pass.

## Local setup

Requires Node 20+, npm 10+, and a running MongoDB (locally via Docker, or a
free MongoDB Atlas cluster).

```bash
git clone https://github.com/ayush-kumar-yadav/BluBoxx.git
cd BluBoxx
npm install          # installs and links all three workspaces

cp packages/server/.env.example packages/server/.env
cp packages/client/.env.example packages/client/.env
```

Start MongoDB (and, optionally, Judge0 for real code execution — see below):
```bash
docker compose up -d mongo
```

Fill in `packages/server/.env`:
```
MONGO_URI=mongodb://localhost:27017/bluboxx
JWT_SECRET=<any random string for local dev>
JUDGE0_API_URL=http://localhost:2358   # or leave default to use the free public instance
```

Run it:
```bash
# terminal 1
npm run dev:server

# terminal 2
npm run dev:client
```

Visit http://localhost:5173, sign up, and create a room.

### Self-hosted Judge0 (optional, for real code execution locally)

The official Judge0 CE Docker setup runs alongside this repo's `mongo`
service. See `packages/server/src/judge0.ts` for the exact env vars
(`JUDGE0_API_URL` / `JUDGE0_AUTH_TOKEN` for self-hosted, or
`JUDGE0_API_KEY` if you're using a RapidAPI-hosted instance instead).
Without any Judge0 configured, `JUDGE0_API_URL` defaults to the free public
`ce.judge0.com` instance, which works but is shared and rate-limited.

## Deployment

Full step-by-step guide (MongoDB Atlas, Render, Vercel, and the Judge0
tradeoffs) is in `DEPLOYMENT.md`. Live stack:

| Piece   | Host                                                          |
|---------|----------------------------------------------------------------|
| Client  | Vercel (`packages/client`, Vite build)                          |
| Server  | Render (`npm run build` / `npm run start` from the repo root)   |
| Database| MongoDB Atlas (free M0 tier)                                    |
| Judge0  | Free public `ce.judge0.com` instance (see note above)            |

## Known limitations

- Live room state (code, presence, timer, notes) doesn't survive a server
  restart — see the Architecture section above
- Auto-grading covers JavaScript, TypeScript, and Python only; Java/C++/C
  show a clear unsupported message rather than a broken result
- Manual rating and auto-grading are separate systems — passing all hidden
  tests doesn't automatically fill in a score; the interviewer still submits
  one explicitly via "Rate & complete"
- The deployed demo uses Judge0's shared public instance, not a dedicated
  self-hosted one, as a deliberate cost tradeoff for a portfolio deployment