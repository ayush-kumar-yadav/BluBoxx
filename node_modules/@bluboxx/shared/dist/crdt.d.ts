import { CRDTChar, CRDTOp, DeleteOp, InsertOp } from './types.js';
/**
 * RGA (Replicated Growable Array) - a CRDT for ordered sequences (text).
 *
 * Core invariant this class must maintain:
 *   Given the same set of ops applied in ANY order, on ANY replica,
 *   every replica converges to the identical visible string.
 */
export declare class RGA {
    private readonly siteId;
    private counter;
    private chars;
    private indexById;
    private pendingInserts;
    private pendingDeletes;
    constructor(siteId: string);
    private nextId;
    /** Visible text only (tombstones filtered out). */
    toString(): string;
    private findIndexById;
    /**
     * Deterministic tie-break between two chars that share the same origin
     * (i.e. concurrent inserts at the same position from different sites).
     * Pure function of data every replica already has - no coordination
     * needed for every replica to agree on the same winner.
     *
     * Returns true if `a` should be placed before `b`.
     */
    private hasPriority;
    /**
     * Inserts `char` into `this.chars` at its correct canonical position:
     * immediately after its origin, but after any existing siblings
     * (chars with the same origin) that have higher tie-break priority.
     * Used for both local and remote inserts, so both go through the exact
     * same positioning logic - which is what guarantees convergence.
     */
    private insertIntoSequence;
    /** Rebuild the id->index map for everything at/after `from` (splice shifts indices). */
    private reindexFrom;
    /**
     * After a char becomes known, replay any buffered ops that were waiting
     * on it - and recursively, in case that unblocks further chains.
     */
    private drainPending;
    private applyInsert;
    private applyDelete;
    /**
     * Local insert at a visible-text index. Produces the op to broadcast
     * to other replicas, and applies it to local state immediately
     * (optimistic local echo).
     */
    localInsert(index: number, value: string): InsertOp;
    /**
     * Local delete at a visible-text index. Marks tombstone, does not
     * physically remove (so future originId references stay resolvable).
     */
    localDelete(index: number): DeleteOp;
    /**
     * Apply an op that arrived from another replica (or was replayed from
     * the server's op-log on reconnect). Idempotent and order-independent.
     */
    applyRemote(op: CRDTOp): void;
    /** Used on reconnect: replay a stored op-log from a given point. */
    applyOpLog(ops: CRDTOp[]): void;
    /** Snapshot for persistence - full char list including tombstones. */
    getSnapshot(): CRDTChar[];
    loadSnapshot(chars: CRDTChar[]): void;
}
//# sourceMappingURL=crdt.d.ts.map