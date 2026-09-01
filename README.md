# BluBoxx

A collaborative technical interview platform where candidates and interviewers
simultaneously edit, execute, and review code — synced in real time by a
custom-built CRDT (Replicated Growable Array), not a third-party library.

## Why this exists

Most "collaborative editor" projects wrap Yjs or ShareDB and call it done.
BluBoxx implements the conflict-free merge algorithm itself
(`packages/shared/src/crdt.ts`), so the hard part — guaranteeing every
replica converges to the same document regardless of network order — is
actually engineered here, not imported.

## Architecture

```
packages/
  shared/   CRDT engine + shared types - imported identically by client & server
  server/   Express + Socket.IO - room management, op broadcast/persistence, code execution proxy
  client/   React + Vite + CodeMirror 6 - the interview room UI
```

Client and server both depend on `@bluboxx/shared` so the merge logic is
never duplicated or allowed to drift between the two.

## Setup

Requires Node 20+ and npm 10+.

```bash
git init
git add .
git commit -m "chore: scaffold monorepo"

npm install          # installs and links all three workspaces

cp packages/server/.env.example packages/server/.env
cp packages/client/.env.example packages/client/.env
```

You'll also want Redis and MongoDB running locally for Week 2+ (presence
and persistence aren't wired up yet in this scaffold):

```bash
docker run -d -p 6379:6379 redis
docker run -d -p 27017:27017 mongo
```

## Running it

```bash
# terminal 1
npm run dev:server

# terminal 2
npm run dev:client
```

Visit http://localhost:5173 — you should see "Server connection: ✅ connected"
once both are running, confirming the socket layer works end to end.

## Roadmap

- [ ] **Week 1**: Implement `RGA.localInsert` / `localDelete` / `applyRemote`
      in `packages/shared/src/crdt.ts`. Get the convergence tests in
      `crdt.test.ts` passing. Wire it into `App.tsx` with CodeMirror.
- [ ] **Week 2**: Room CRUD + roles (interviewer/candidate), Judge0
      integration for Run Code, live cursor presence, private interviewer
      notes panel, Redis-backed presence.
- [ ] **Week 3**: Question bank, session persistence + op-log replay,
      deploy (Vercel + Render), demo recording.

## Tech stack

React + TypeScript + Vite · CodeMirror 6 · Socket.IO · Node/Express ·
Redis · MongoDB · Judge0 (sandboxed execution) · JWT auth
