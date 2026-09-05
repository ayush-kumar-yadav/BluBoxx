import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import type { CRDTOp, OpMessage } from '@bluboxx/shared';
import { roomsRouter, resolveRole, getRoom, setRoomLanguage } from './rooms.js';
import { runCode } from './judge0.js';
import { listQuestionSummaries } from './questions.js';
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

app.use('/api/rooms', roomsRouter);

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
  interviewerToken?: string;
  siteId: string;
}

interface RunCodePayload {
  roomId: string;
  code: string;
  language: string;
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

interface PresenceEntry {
  siteId: string;
  role: 'interviewer' | 'candidate';
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

io.on('connection', (socket) => {
  socket.on('join-room', (payload: JoinRoomPayload) => {
    const { roomId, interviewerToken, siteId } = payload;
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.siteId = siteId;

    const role = resolveRole(roomId, interviewerToken);
    socket.emit('role', role);

    // Register this socket in the room's presence map, then tell
    // EVERYONE currently in the room (including this new socket) the
    // full up-to-date participant list.
    if (!roomPresence.has(roomId)) roomPresence.set(roomId, new Map());
    roomPresence.get(roomId)!.set(socket.id, { siteId, role });
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
    // (i.e. whose token checked out in join-room) can write notes.
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
        } else {
          broadcastPresence(roomId);
        }
      }
    }
  });
});

const PORT = process.env.PORT ?? 4000;
httpServer.listen(PORT, () => {
  console.log(`BluBoxx server listening on :${PORT}`);
});