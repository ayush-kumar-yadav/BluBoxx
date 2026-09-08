import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import type { CRDTOp, OpMessage } from '@bluboxx/shared';
import { RGA } from '@bluboxx/shared';
import { connectMongo } from './db.js';
import { authRouter, verifyToken } from './auth.js';
import { interviewsRouter, usersRouter } from './interviews.js';
import { roomsRouter, resolveRole, getRoom, setRoomLanguage, claimCandidateIfUnset } from './rooms.js';
import { runCode } from './judge0.js';
import { runTestSuite, redactHiddenDetail, isGradableLanguage } from './testHarness.js';
import { listQuestionSummaries, getQuestion } from './questions.js';
import { getOpLog, appendOps } from './opLog.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
app.get('/api/questions', (_req, res) => {
  res.json(listQuestionSummaries());
});

app.use('/api/auth', authRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/interviews', interviewsRouter);
app.use('/api/users', usersRouter);

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' },
});

// In-memory op-log, keyed by roomId.
// TODO (Week 3): move to Redis (hot path) with a Mongo write-behind for
// durability - an in-memory log doesn't survive a restart and won't work
// once there's more than one server instance.
const roomOpLogs = new Map<string, CRDTOp[]>();

// Interviewer-only notes, keyed by roomId. Never sent to a socket that
// hasn't been placed in the room's interviewer-only Socket.IO room (see
// `interviewerRoom` below) - a candidate connection simply never receives
// this data, not just hides it in the UI.
const roomNotes = new Map<string, string>();

function interviewerRoom(roomId: string): string {
  return `${roomId}:interviewer`;
}

interface JoinRoomPayload {
  roomId: string;
  siteId: string;
}

interface RunCodePayload {
  roomId: string;
  code: string;
  language: string;
}

interface RunTestsPayload {
  roomId: string;
}

interface CursorPayload {
  roomId: string;
  siteId: string;
  pos: number;
  label: string;
}

interface NotesUpdatePayload {
  roomId: string;
  text: string;
}

interface LanguageChangePayload {
  roomId: string;
  language: string;
}

interface TimerRoomPayload {
  roomId: string;
}

interface TimerSetDurationPayload {
  roomId: string;
  durationSeconds: number;
}

export interface TimerState {
  durationSeconds: number;
  running: boolean;
  endsAt: number | null; // epoch ms - only set while running; clients derive the live countdown from this, not from repeated server ticks
  remainingSeconds: number; // authoritative snapshot whenever NOT running (paused, reset, or never started)
}

const DEFAULT_TIMER_DURATION_SECONDS = 45 * 60;

// Per-room countdown state. Server-authoritative on purpose: if each
// client just ran its own local countdown from a single "start" signal,
// clock drift and reconnects would slowly desync what interviewer and
// candidate each see. Broadcasting endsAt (an absolute timestamp) lets
// every client compute an identical, drift-free remaining time locally.
const roomTimers = new Map<string, TimerState>();

function getOrCreateTimer(roomId: string): TimerState {
  let timer = roomTimers.get(roomId);
  if (!timer) {
    timer = {
      durationSeconds: DEFAULT_TIMER_DURATION_SECONDS,
      running: false,
      endsAt: null,
      remainingSeconds: DEFAULT_TIMER_DURATION_SECONDS,
    };
    roomTimers.set(roomId, timer);
  }
  return timer;
}

function broadcastTimer(roomId: string) {
  io.to(roomId).emit('timer', getOrCreateTimer(roomId));
}

interface PresenceEntry {
  siteId: string;
  role: 'interviewer' | 'candidate';
  name: string;
}

// Who's actually connected to each room right now, keyed by socket.id (a
// site/browser tab can only ever occupy one socket, so this can't double
// count a refreshing client the way keying by siteId alone might during
// the brief overlap of an old socket disconnecting and a new one joining).
const roomPresence = new Map<string, Map<string, PresenceEntry>>();

function broadcastPresence(roomId: string) {
  const participants = Array.from(roomPresence.get(roomId)?.values() ?? []);
  io.to(roomId).emit('presence', participants);
}

// Every socket must present a valid JWT (the same one issued by
// /api/auth/login or /signup, sent as socket.handshake.auth.token by the
// client) before it's allowed to do anything else. Role resolution and
// presence both depend on knowing who this connection actually is - an
// anonymous socket has no meaningful role anymore.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    next(new Error('unauthorized'));
    return;
  }
  socket.data.userId = payload.sub;
  socket.data.userName = payload.name;
  next();
});

io.on('connection', (socket) => {
  socket.on('join-room', async (payload: JoinRoomPayload) => {
    const { roomId, siteId } = payload;
    const userId: string = socket.data.userId;
    const userName: string = socket.data.userName;

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.siteId = siteId;

    const role = resolveRole(roomId, userId);
    socket.emit('role', role);

    if (role === 'candidate') {
      // No-op if this room's candidate slot is already claimed by someone
      // else (e.g. a second onlooker opening the link) - see the doc
      // comment on claimCandidateIfUnset in rooms.ts.
      await claimCandidateIfUnset(roomId, userId);
    }

    // Register this socket in the room's presence map, then tell
    // EVERYONE currently in the room (including this new socket) the
    // full up-to-date participant list.
    if (!roomPresence.has(roomId)) roomPresence.set(roomId, new Map());
    roomPresence.get(roomId)!.set(socket.id, { siteId, role, name: userName });
    broadcastPresence(roomId);

    if (role === 'interviewer') {
      // Only interviewer sockets ever join this room - candidates are
      // never placed here, so `io.to(interviewerRoom(...))` genuinely
      // cannot reach them, regardless of what the client UI does.
      socket.join(interviewerRoom(roomId));
      socket.emit('notes', roomNotes.get(roomId) ?? '');
    }

    // Replay everything that's happened in this room so far. The client
    // rebuilds its document from this via RGA.applyOpLog().
    socket.emit('op-log', getOpLog(roomId));

    // Tell this socket the room's CURRENT language - not necessarily the
    // one it was created with, if someone switched it before this client
    // joined. Every client (interviewer or candidate) reacts to this the
    // same way, so a mid-interview switch never leaves one side out of
    // sync with the other's syntax highlighting or Run Code target.
    const room = getRoom(roomId);
    if (room) {
      socket.emit('language', room.language);
    }

    // Same idea for the countdown timer - a candidate (or a reconnecting
    // interviewer) joining mid-session sees exactly where the clock
    // currently stands, not a freshly-reset one.
    socket.emit('timer', getOrCreateTimer(roomId));
  });

  socket.on('op', (msg: OpMessage) => {
    // Persist BEFORE broadcasting - guarantees a client joining in the gap
    // between these two lines still sees the op, via one path or the other.
    appendOps(msg.roomId, [msg.op]);
    socket.to(msg.roomId).emit('op', msg);
  });

  socket.on('cursor', (payload: CursorPayload) => {
    // Excludes the sender - no reason to echo someone's own cursor back.
    socket.to(payload.roomId).emit('cursor', payload);
  });

  socket.on('notes-update', (payload: NotesUpdatePayload) => {
    // Server-side check, not just a client-side UI restriction: only a
    // socket that actually joined the interviewer room for this roomId
    // (i.e. whose authenticated identity matched the room's interviewer)
    // can write notes.
    if (!socket.rooms.has(interviewerRoom(payload.roomId))) return;
    roomNotes.set(payload.roomId, payload.text);
    // to() not io.to() - don't echo back to the sender, who already has
    // the text locally; only reaches OTHER interviewer sockets (e.g. a
    // panel interview with more than one interviewer in the room).
    socket.to(interviewerRoom(payload.roomId)).emit('notes', payload.text);
  });

  socket.on('language-change', (payload: LanguageChangePayload) => {
    const applied = setRoomLanguage(payload.roomId, payload.language);
    if (!applied) return; // unknown language id - ignore rather than desync the room
    // io.to (not socket.to) - both participants' editors re-highlight and
    // both Run Code buttons switch targets at the same instant, regardless
    // of who clicked the dropdown.
    io.to(payload.roomId).emit('language', payload.language);
  });

  // Timer controls are interviewer-only, checked the same way notes-update
  // is: by socket room membership, which was only granted in join-room
  // after resolveRole confirmed this connection's authenticated identity
  // matches the room's interviewerId. A candidate emitting these events is
  // silently ignored, not just hidden from the candidate's UI.
  socket.on('timer-set-duration', (payload: TimerSetDurationPayload) => {
    if (!socket.rooms.has(interviewerRoom(payload.roomId))) return;
    if (!Number.isFinite(payload.durationSeconds) || payload.durationSeconds <= 0) return;
    const timer = getOrCreateTimer(payload.roomId);
    timer.durationSeconds = Math.round(payload.durationSeconds);
    timer.remainingSeconds = timer.durationSeconds;
    timer.running = false;
    timer.endsAt = null;
    broadcastTimer(payload.roomId);
  });

  socket.on('timer-start', (payload: TimerRoomPayload) => {
    if (!socket.rooms.has(interviewerRoom(payload.roomId))) return;
    const timer = getOrCreateTimer(payload.roomId);
    if (timer.running || timer.remainingSeconds <= 0) return;
    timer.running = true;
    timer.endsAt = Date.now() + timer.remainingSeconds * 1000;
    broadcastTimer(payload.roomId);
  });

  socket.on('timer-pause', (payload: TimerRoomPayload) => {
    if (!socket.rooms.has(interviewerRoom(payload.roomId))) return;
    const timer = getOrCreateTimer(payload.roomId);
    if (!timer.running) return;
    timer.remainingSeconds = Math.max(0, Math.round(((timer.endsAt ?? Date.now()) - Date.now()) / 1000));
    timer.running = false;
    timer.endsAt = null;
    broadcastTimer(payload.roomId);
  });

  socket.on('timer-reset', (payload: TimerRoomPayload) => {
    if (!socket.rooms.has(interviewerRoom(payload.roomId))) return;
    const timer = getOrCreateTimer(payload.roomId);
    timer.remainingSeconds = timer.durationSeconds;
    timer.running = false;
    timer.endsAt = null;
    broadcastTimer(payload.roomId);
  });

  socket.on('run-code', async (payload: RunCodePayload) => {
    // Broadcast to the WHOLE room (io.to, not socket.to) - including the
    // sender - so interviewer and candidate see the exact same run at the
    // exact same time, not just whoever clicked Run.
    io.to(payload.roomId).emit('run-started');
    try {
      const result = await runCode(payload.code, payload.language);
      io.to(payload.roomId).emit('run-result', result);
    } catch (err) {
      io.to(payload.roomId).emit('run-result', {
        stdout: null,
        stderr: err instanceof Error ? err.message : 'Execution failed',
        compileOutput: null,
        statusDescription: 'Error',
        time: null,
        memory: null,
      });
    }
  });

  socket.on('run-tests', async (payload: RunTestsPayload) => {
    const room = getRoom(payload.roomId);
    const question = room ? getQuestion(room.questionId) : undefined;
    if (!room || !question) return;

    io.to(payload.roomId).emit('tests-started');

    if (!isGradableLanguage(room.language)) {
      // Java/C++/C don't have a driver harness built (see testHarness.ts) -
      // say so plainly rather than pretending to grade and getting it wrong.
      io.to(payload.roomId).emit('test-results-unsupported', { language: room.language });
      return;
    }

    // Reconstruct the candidate's current code the same way a reconnecting
    // client's editor does - the server doesn't otherwise keep a "latest
    // full text" cache outside the op-log.
    const doc = new RGA('system-grader');
    doc.applyOpLog(getOpLog(payload.roomId));
    const code = doc.toString();

    const fullSummary = await runTestSuite(code, room.language, question);
    const redactedSummary = redactHiddenDetail(fullSummary);

    // Interviewer sockets get full detail on every test, including hidden
    // ones; candidate sockets get pass/fail only for hidden tests. Sent
    // per-socket (via roomPresence, not a room-wide broadcast) so this
    // never depends on emit ordering across two identically-named events.
    const participants = roomPresence.get(payload.roomId);
    if (participants) {
      for (const [socketId, entry] of participants) {
        io.to(socketId).emit('test-results', entry.role === 'interviewer' ? fullSummary : redactedSummary);
      }
    } else {
      io.to(payload.roomId).emit('test-results', redactedSummary);
    }
  });

  socket.on('disconnect', () => {
    const { roomId, siteId } = socket.data as { roomId?: string; siteId?: string };
    if (roomId && siteId) {
      // Tell everyone else in the room to remove this cursor.
      socket.to(roomId).emit('cursor-remove', { siteId });

      const participants = roomPresence.get(roomId);
      if (participants) {
        participants.delete(socket.id);
        if (participants.size === 0) {
          roomPresence.delete(roomId);
          roomTimers.delete(roomId); // last person left - drop the countdown too, it'll re-init at DEFAULT_TIMER_DURATION_SECONDS if this room is ever rejoined
        } else {
          broadcastPresence(roomId);
        }
      }
    }
  });
});

const PORT = process.env.PORT ?? 4000;

async function bootstrap() {
  await connectMongo();
  httpServer.listen(PORT, () => {
    console.log(`BluBoxx server listening on :${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start BluBoxx server:', err);
  process.exit(1);
});