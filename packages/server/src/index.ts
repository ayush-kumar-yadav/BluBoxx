import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import type { CRDTOp, OpMessage } from '@bluboxx/shared';
import { roomsRouter, resolveRole } from './rooms.js';
import { runCode } from './judge0.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
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

function getOpLog(roomId: string): CRDTOp[] {
  let log = roomOpLogs.get(roomId);
  if (!log) {
    log = [];
    roomOpLogs.set(roomId, log);
  }
  return log;
}

interface JoinRoomPayload {
  roomId: string;
  interviewerToken?: string;
}
interface RunCodePayload {
  roomId: string;
  code: string;
  language: string;
}

io.on('connection', (socket) => {
  socket.on('join-room', (payload: JoinRoomPayload) => {
    const { roomId, interviewerToken } = payload;
    socket.join(roomId);

    const role = resolveRole(roomId, interviewerToken);
    socket.emit('role', role);

    // Replay everything that's happened in this room so far. The client
    // rebuilds its document from this via RGA.applyOpLog().
    socket.emit('op-log', getOpLog(roomId));
  });

  socket.on('op', (msg: OpMessage) => {
    // Persist BEFORE broadcasting - guarantees a client joining in the gap
    // between these two lines still sees the op, via one path or the other.
    getOpLog(msg.roomId).push(msg.op);
    socket.to(msg.roomId).emit('op', msg);
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
    // TODO (Week 2 cont.): presence - broadcast who's still connected
  });
});

const PORT = process.env.PORT ?? 4000;
httpServer.listen(PORT, () => {
  console.log(`BluBoxx server listening on :${PORT}`);
});