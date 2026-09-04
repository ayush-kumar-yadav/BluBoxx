/**
 * Every character ever inserted gets a globally unique, permanent ID.
 * siteId = which client/session created it, seq = that site's local counter.
 * This pair is unique across the whole distributed system without needing
 * a central authority to hand out IDs.
 */
export interface CharId {
  site: string;
  seq: number;
}

export function charIdEquals(a: CharId | null, b: CharId | null): boolean {
  if (a === null || b === null) return a === b;
  return a.site === b.site && a.seq === b.seq;
}

export function charIdToString(id: CharId): string {
  return `${id.site}:${id.seq}`;
}

/**
 * A single character in the document. Never physically removed on delete —
 * it's tombstoned instead, so remote sites that reference it (as an origin
 * for their own inserts) can still resolve position deterministically.
 */
export interface CRDTChar {
  id: CharId;
  value: string;
  originId: CharId | null; // the char this was inserted immediately after (null = start of doc)
  deleted: boolean;
}

export interface InsertOp {
  type: 'insert';
  char: CRDTChar;
}

export interface DeleteOp {
  type: 'delete';
  id: CharId;
}

export type CRDTOp = InsertOp | DeleteOp;

/** Wire format: what actually gets sent over the socket. */
export interface OpMessage {
  roomId: string;
  op: CRDTOp;
  senderSite: string;
}
/** Result of a sandboxed code execution, normalized from Judge0's response shape. */
export interface RunResult {
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  statusDescription: string;
  time: string | null;
  memory: number | null;
}
export type ParticipantRole = 'interviewer' | 'candidate';

/** Broadcast whenever someone joins or leaves a room, so clients can show
 * "waiting for candidate" / "candidate disconnected" states. */
export interface PresenceUpdate {
  roles: ParticipantRole[];
}

/**
 * Result of running a candidate's code against ONE test case. Hidden test
 * cases deliberately omit input/expectedOutput/actualOutput/error - the
 * server strips these before sending, so a candidate can never see what a
 * hidden test actually checks, only whether they passed it. This is
 * enforced server-side (see server/src/testHarness.ts), not just hidden
 * in the UI.
 */
export interface TestResult {
  passed: boolean;
  isHidden: boolean;
  input?: unknown[];
  expectedOutput?: unknown;
  actualOutput?: unknown;
  error?: string;
}

export interface TestRunSummary {
  results: TestResult[];
  passedCount: number;
  totalCount: number;
}

export interface QuestionSummary {
  id: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

/** Public-facing question data - example test cases only, hidden ones
 * reduced to just a count. The full test case list (with real inputs and
 * expected outputs for hidden cases) never leaves the server. */
export interface QuestionDetail {
  id: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  description: string;
  functionName: string;
  starterCode: string;
  examples: Array<{ input: unknown[]; expectedOutput: unknown }>;
  hiddenTestCount: number;
}
