import { charIdEquals, charIdToString, } from './types.js';
/**
 * RGA (Replicated Growable Array) - a CRDT for ordered sequences (text).
 *
 * Core invariant this class must maintain:
 *   Given the same set of ops applied in ANY order, on ANY replica,
 *   every replica converges to the identical visible string.
 */
export class RGA {
    siteId;
    counter = 0;
    // Full character list INCLUDING tombstones, kept in one canonical order.
    chars = [];
    // Fast lookup: id string -> index in `chars`. Kept in sync on every insert.
    indexById = new Map();
    // Ops that arrived before the char they depend on. Keyed by the missing
    // dependency's id string; replayed as soon as that dependency shows up.
    pendingInserts = new Map();
    pendingDeletes = new Map();
    constructor(siteId) {
        this.siteId = siteId;
    }
    nextId() {
        this.counter += 1;
        return { site: this.siteId, seq: this.counter };
    }
    /** Visible text only (tombstones filtered out). */
    toString() {
        return this.chars
            .filter((c) => !c.deleted)
            .map((c) => c.value)
            .join('');
    }
    findIndexById(id) {
        return this.indexById.get(charIdToString(id)) ?? -1;
    }
    /**
     * Deterministic tie-break between two chars that share the same origin
     * (i.e. concurrent inserts at the same position from different sites).
     * Pure function of data every replica already has - no coordination
     * needed for every replica to agree on the same winner.
     *
     * Returns true if `a` should be placed before `b`.
     */
    hasPriority(a, b) {
        if (a.site !== b.site)
            return a.site > b.site;
        return a.seq > b.seq;
    }
    /**
     * Inserts `char` into `this.chars` at its correct canonical position:
     * immediately after its origin, but after any existing siblings
     * (chars with the same origin) that have higher tie-break priority.
     * Used for both local and remote inserts, so both go through the exact
     * same positioning logic - which is what guarantees convergence.
     */
    insertIntoSequence(char) {
        let pos;
        if (char.originId === null) {
            pos = 0;
        }
        else {
            const originIdx = this.findIndexById(char.originId);
            // Caller must guarantee the origin already exists (see applyRemote's
            // buffering for the case where it doesn't yet).
            pos = originIdx + 1;
        }
        while (pos < this.chars.length) {
            const candidate = this.chars[pos];
            if (!charIdEquals(candidate.originId, char.originId))
                break;
            if (this.hasPriority(candidate.id, char.id)) {
                pos += 1;
            }
            else {
                break;
            }
        }
        this.chars.splice(pos, 0, char);
        this.reindexFrom(pos);
    }
    /** Rebuild the id->index map for everything at/after `from` (splice shifts indices). */
    reindexFrom(from) {
        for (let i = from; i < this.chars.length; i += 1) {
            this.indexById.set(charIdToString(this.chars[i].id), i);
        }
    }
    /**
     * After a char becomes known, replay any buffered ops that were waiting
     * on it - and recursively, in case that unblocks further chains.
     */
    drainPending(id) {
        const key = charIdToString(id);
        const waitingInserts = this.pendingInserts.get(key);
        if (waitingInserts) {
            this.pendingInserts.delete(key);
            for (const op of waitingInserts) {
                this.applyInsert(op);
            }
        }
        const waitingDeletes = this.pendingDeletes.get(key);
        if (waitingDeletes) {
            this.pendingDeletes.delete(key);
            for (const op of waitingDeletes) {
                this.applyDelete(op);
            }
        }
    }
    applyInsert(op) {
        const { char } = op;
        // Idempotency: duplicate delivery of the same insert is a no-op.
        if (this.findIndexById(char.id) !== -1)
            return;
        // Dependency not yet seen - buffer until it arrives.
        if (char.originId !== null && this.findIndexById(char.originId) === -1) {
            const key = charIdToString(char.originId);
            const queue = this.pendingInserts.get(key) ?? [];
            queue.push(op);
            this.pendingInserts.set(key, queue);
            return;
        }
        this.insertIntoSequence(char);
        this.drainPending(char.id);
    }
    applyDelete(op) {
        const idx = this.findIndexById(op.id);
        if (idx === -1) {
            // The insert hasn't arrived yet - buffer the delete too.
            const key = charIdToString(op.id);
            const queue = this.pendingDeletes.get(key) ?? [];
            queue.push(op);
            this.pendingDeletes.set(key, queue);
            return;
        }
        this.chars[idx].deleted = true; // idempotent if already true
    }
    /**
     * Local insert at a visible-text index. Produces the op to broadcast
     * to other replicas, and applies it to local state immediately
     * (optimistic local echo).
     */
    localInsert(index, value) {
        const visible = this.chars.filter((c) => !c.deleted);
        if (index < 0 || index > visible.length) {
            throw new RangeError(`localInsert: index ${index} out of bounds (len ${visible.length})`);
        }
        const originId = index === 0 ? null : visible[index - 1].id;
        const char = {
            id: this.nextId(),
            value,
            originId,
            deleted: false,
        };
        this.insertIntoSequence(char);
        return { type: 'insert', char };
    }
    /**
     * Local delete at a visible-text index. Marks tombstone, does not
     * physically remove (so future originId references stay resolvable).
     */
    localDelete(index) {
        const visible = this.chars.filter((c) => !c.deleted);
        if (index < 0 || index >= visible.length) {
            throw new RangeError(`localDelete: index ${index} out of bounds (len ${visible.length})`);
        }
        const target = visible[index];
        target.deleted = true;
        return { type: 'delete', id: target.id };
    }
    /**
     * Apply an op that arrived from another replica (or was replayed from
     * the server's op-log on reconnect). Idempotent and order-independent.
     */
    applyRemote(op) {
        if (op.type === 'insert') {
            this.applyInsert(op);
        }
        else {
            this.applyDelete(op);
        }
    }
    /** Used on reconnect: replay a stored op-log from a given point. */
    applyOpLog(ops) {
        for (const op of ops) {
            this.applyRemote(op);
        }
    }
    /** Snapshot for persistence - full char list including tombstones. */
    getSnapshot() {
        return this.chars;
    }
    loadSnapshot(chars) {
        this.chars = chars;
        this.indexById.clear();
        this.reindexFrom(0);
    }
}
//# sourceMappingURL=crdt.js.map