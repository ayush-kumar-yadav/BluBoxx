import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { RGA, DEFAULT_LANGUAGE, isSupportedLanguage } from '@bluboxx/shared';
import { getQuestion } from './questions.js';
import { appendOps } from './opLog.js';
import type { QuestionDetail } from '@bluboxx/shared';

export interface RoomRecord {
  id: string;
  interviewerToken: string;
  language: string;
  questionId: string;
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

roomsRouter.post('/', (req, res) => {
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
    interviewerToken: randomUUID(),
    language,
    questionId: question.id,
    createdAt: Date.now(),
  };
  rooms.set(room.id, room);

  // Seed the op-log with the starter code, done here (once, server-side)
  // rather than having the first client to join insert it - two clients
  // joining a brand-new room at nearly the same instant could otherwise
  // both see an empty op-log and both try to seed it, producing garbled
  // duplicate text. A 'system' site id keeps this indistinguishable from
  // any other CRDT-authored content in the op-log.
  const seedRga = new RGA('system');
  const seedOps = [...question.starterCode].map((ch, i) => seedRga.localInsert(i, ch));
  appendOps(room.id, seedOps);

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
  });
});