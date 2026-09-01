import { CRDTChar, CRDTOp, CharId, charIdEquals } from './types.js';

/**
 * RGA (Replicated Growable Array) - a CRDT for ordered sequences (text).
 *
 * Core invariant this class must maintain:
 *   Given the same set of ops applied in ANY order, on ANY replica,
 *   every replica converges to the identical visible string.
 *
 * This is intentionally left as a skeleton with the structure in place.
 * The merge logic (applyRemote + resolving insert position via originId
 * and tie-breaking on concurrent inserts at the same origin) is the
 * actual algorithm to implement first - see TODOs below.
 */
export class RGA {
  private readonly siteId: string;
  private counter = 0;

  // Full character list INCLUDING tombstones, kept in one canonical order.
  private chars: CRDTChar[] = [];

  constructor(siteId: string) {
    this.siteId = siteId;
  }

  private nextId(): CharId {
    this.counter += 1;
    return { site: this.siteId, seq: this.counter };
  }

  /** Visible text only (tombstones filtered out). */
  toString(): string {
    return this.chars
      .filter((c) => !c.deleted)
      .map((c) => c.value)
      .join('');
  }

  /**
   * Local insert at a visible-text index. Produces the op to broadcast
   * to other replicas, and applies it to local state immediately
   * (optimistic local echo).
   *
   * TODO (Week 1):
   *  - Walk visible chars to find the char currently at `index - 1`;
   *    that becomes originId (null if index === 0).
   *  - Create the CRDTChar, insert it into `this.chars` immediately
   *    after its origin in canonical order.
   */
  localInsert(_index: number, _value: string): CRDTOp {
    throw new Error('TODO: implement localInsert');
  }

  /**
   * Local delete at a visible-text index. Marks tombstone, does not
   * physically remove (so future originId references stay resolvable).
   *
   * TODO (Week 1): find the visible char at `index`, set deleted = true.
   */
  localDelete(_index: number): CRDTOp {
    throw new Error('TODO: implement localDelete');
  }

  /**
   * Apply an op that arrived from another replica (or was replayed from
   * the server's op-log on reconnect). Must be idempotent and order-
   * independent - this is where the actual conflict resolution lives.
   *
   * TODO (Week 1 - the hard part):
   *  - insert: find originId in `this.chars` (or treat as start-of-doc
   *    if null). If two chars share the same originId (concurrent
   *    inserts at the same position from different sites), break the
   *    tie deterministically - e.g. by comparing (site, seq) so every
   *    replica picks the same winner without coordination.
   *  - delete: find the char by id, set deleted = true. If the id isn't
   *    known yet (op arrived out of order), buffer it and retry once
   *    the referenced insert arrives.
   */
  applyRemote(_op: CRDTOp): void {
    throw new Error('TODO: implement applyRemote');
  }

  /** Used on reconnect: replay a stored op-log from a given point. */
  applyOpLog(ops: CRDTOp[]): void {
    for (const op of ops) {
      this.applyRemote(op);
    }
  }

  /** Snapshot for persistence - full char list including tombstones. */
  getSnapshot(): CRDTChar[] {
    return this.chars;
  }

  loadSnapshot(chars: CRDTChar[]): void {
    this.chars = chars;
  }
}
