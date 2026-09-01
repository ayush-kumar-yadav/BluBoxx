import { Router } from 'express';
import { randomUUID } from 'node:crypto';

export interface RoomRecord {
  id: string;
  interviewerToken: string;
  language: string;
  questionTitle: string;
  starterCode: string;
  createdAt: number;
}

// In-memory store, keyed by room id.
// TODO (Week 3): move to MongoDB so rooms survive a server restart and
// can be listed on an interviewer's "past sessions" dashboard.
const rooms = new Map<string, RoomRecord>();

export function getRoom(roomId: string): RoomRecord | undefined {
  return rooms.get(roomId);
}

/**
 * Determines a joining socket's role by comparing the token it presents
 * against the room's interviewerToken. The token is handed out ONCE, at
 * creation time, only to the creator - so possessing it is what proves
 * "I'm the interviewer for this room," without needing full user accounts
 * yet. Anyone else with just the room link is a candidate.
 */
export function resolveRole(roomId: string, presentedToken: string | undefined): 'interviewer' | 'candidate' {
  const room = rooms.get(roomId);
  if (room && presentedToken && presentedToken === room.interviewerToken) {
    return 'interviewer';
  }
  return 'candidate';
}

export const roomsRouter = Router();

roomsRouter.post('/', (req, res) => {
  const { language = 'javascript', questionTitle = 'Untitled Question', starterCode = '' } = req.body ?? {};

  const room: RoomRecord = {
    id: randomUUID(),
    interviewerToken: randomUUID(),
    language,
    questionTitle,
    starterCode,
    createdAt: Date.now(),
  };
  rooms.set(room.id, room);

  // interviewerToken is only ever returned here, at creation. Anyone who
  // just has the room link (GET below) never sees it.
  res.status(201).json({
    roomId: room.id,
    interviewerToken: room.interviewerToken,
  });
});

roomsRouter.get('/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  // Public info only - interviewerToken deliberately omitted.
  res.json({
    roomId: room.id,
    language: room.language,
    questionTitle: room.questionTitle,
    starterCode: room.starterCode,
    createdAt: room.createdAt,
  });
});