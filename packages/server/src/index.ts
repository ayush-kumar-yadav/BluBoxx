import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import type { OpMessage } from '@bluboxx/shared';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// TODO (Week 2): auth routes, room CRUD, question bank routes
// app.use('/api/auth', authRouter);
// app.use('/api/rooms', roomsRouter);

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' },
});

io.on('connection', (socket) => {
  socket.on('join-room', (roomId: string) => {
    socket.join(roomId);
    // TODO (Week 1): on join, send the room's full op-log so the client
    // can rebuild state via RGA.applyOpLog(). This is what makes
    // reconnect-and-converge work.
  });

  socket.on('op', (msg: OpMessage) => {
    // TODO (Week 1): append msg.op to the room's persisted op-log (Redis
    // list or DB), THEN broadcast. Persist-before-broadcast matters -
    // it's what makes replay/recovery correct if the server restarts.
    socket.to(msg.roomId).emit('op', msg);
  });

  socket.on('disconnect', () => {
    // TODO: update presence state (who's still connected) per room
  });
});

const PORT = process.env.PORT ?? 4000;
httpServer.listen(PORT, () => {
  console.log(`BluBoxx server listening on :${PORT}`);
});
