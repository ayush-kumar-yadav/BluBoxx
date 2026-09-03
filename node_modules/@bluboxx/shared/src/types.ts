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
