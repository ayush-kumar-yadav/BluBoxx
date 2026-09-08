import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { RGA, DEFAULT_LANGUAGE, isSupportedLanguage } from '@bluboxx/shared';
import { getQuestion } from './questions.js';
import { appendOps } from './opLog.js';
import { requireAuth } from './auth.js';
import { InterviewRecord } from './models/InterviewRecord.js';
import type { QuestionDetail } from '@bluboxx/shared';

export interface RoomRecord {
  id: string;
  interviewerId: string; // Mongo User _id of whoever created the room
  language: string;
  questionId: string;
  createdAt: number;
}

// In-memory store, keyed by room id. Room state itself (op-log, live
// language, presence) stays in-memory and does NOT survive a restart -
// only the DURABLE parts (who interviewed whom, the rating) are persisted,
// via the InterviewRecord created alongside each room below.
// TODO (Week 3+): move this to Redis so it survives a restart and works
// across more than one server instance.
const rooms = new Map<string, RoomRecord>();

export function getRoom(roomId: string): RoomRecord | undefined {
  return rooms.get(roomId);
}

/**
 * Updates the room's "current" language when someone switches it mid-session
 * (see the 'language-change' socket handler in index.ts). This is what a
 * client joining AFTER a switch sees, not just whatever language the room
 * was created with.
 */
export function setRoomLanguage(roomId: string, language: string): boolean {
  const room = rooms.get(roomId);
  if (!room || !isSupportedLanguage(language)) return false;
  room.language = language;
  return true;
}

/**
 * Role is now derived from WHO you are (the authenticated user id attached
 * to the socket by the io.use middleware in index.ts), not a secret token
 * living in localStorage. Whoever's id matches the room's interviewerId
 * is the interviewer; any other authenticated user opening the link is a
 * candidate. This also means "prove you're the interviewer" now survives
 * clearing browser storage or switching devices, as long as you're logged
 * into the same account.
 */
export function resolveRole(roomId: string, userId: string): 'interviewer' | 'candidate' {
  const room = rooms.get(roomId);
  if (room && room.interviewerId === userId) {
    return 'interviewer';
  }
  return 'candidate';
}

/**
 * The first non-interviewer to join a room claims the "candidate" slot on
 * its InterviewRecord. Later joiners (e.g. an interviewer refreshing, or
 * someone else opening the link out of curiosity) still get treated as
 * 'candidate' role for editor/UI purposes, but don't overwrite who's
 * formally recorded as having taken this interview.
 */
export async function claimCandidateIfUnset(roomId: string, userId: string): Promise<void> {
  await InterviewRecord.updateOne({ roomId, candidate: null }, { $set: { candidate: userId } });
}

/**
 * Strips a question down to what's safe to send to ANY client (candidate
 * included): example test cases in full, hidden ones reduced to a count.
 * This is the only view of question data that ever crosses the wire -
 * hidden inputs/expected outputs stay server-side, used only when actually
 * grading a submission (see testHarness.ts, added when test execution is
 * wired up).
 */
function toPublicQuestion(questionId: string): QuestionDetail | null {
  const question = getQuestion(questionId);
  if (!question) return null;
  const examples = question.testCases
    .filter((tc) => !tc.isHidden)
    .map((tc) => ({ input: tc.input, expectedOutput: tc.expectedOutput }));
  const hiddenTestCount = question.testCases.filter((tc) => tc.isHidden).length;
  return {
    id: question.id,
    title: question.title,
    difficulty: question.difficulty,
    description: question.description,
    functionName: question.functionName,
    starterCode: question.starterCode,
    examples,
    hiddenTestCount,
  };
}

export const roomsRouter = Router();

roomsRouter.post('/', requireAuth, async (req, res) => {
  const { language = DEFAULT_LANGUAGE, questionId } = req.body ?? {};

  const question = getQuestion(questionId);
  if (!question) {
    res.status(400).json({ error: `Unknown questionId: ${questionId}` });
    return;
  }
  if (!isSupportedLanguage(language)) {
    res.status(400).json({ error: `Unsupported language: ${language}` });
    return;
  }

  const room: RoomRecord = {
    id: randomUUID(),
    interviewerId: req.userId!,
    language,
    questionId: question.id,
    createdAt: Date.now(),
  };
  rooms.set(room.id, room);

  // Durable record of this interview, separate from the in-memory room
  // above - this is what survives a server restart and what the
  // interviewer's/candidate's profile page reads from.
  await InterviewRecord.create({
    roomId: room.id,
    interviewer: room.interviewerId,
    candidate: null,
    questionId: question.id,
    questionTitle: question.title,
    language,
  });

  // Seed the op-log with the starter code, done here (once, server-side)
  // rather than having the first client to join insert it - two clients
  // joining a brand-new room at nearly the same instant could otherwise
  // both see an empty op-log and both try to seed it, producing garbled
  // duplicate text. A 'system' site id keeps this indistinguishable from
  // any other CRDT-authored content in the op-log.
  const seedRga = new RGA('system');
  const seedOps = [...question.starterCode].map((ch, i) => seedRga.localInsert(i, ch));
  appendOps(room.id, seedOps);

  res.status(201).json({ roomId: room.id });
});

roomsRouter.get('/:roomId', requireAuth, (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  const question = toPublicQuestion(room.questionId);
  if (!question) {
    res.status(500).json({ error: 'Room references an unknown question' });
    return;
  }
  res.json({
    roomId: room.id,
    language: room.language,
    question,
    createdAt: room.createdAt,
    isInterviewer: room.interviewerId === req.userId,
  });
});