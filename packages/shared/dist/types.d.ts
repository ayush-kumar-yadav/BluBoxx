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
export declare function charIdEquals(a: CharId | null, b: CharId | null): boolean;
export declare function charIdToString(id: CharId): string;
/**
 * A single character in the document. Never physically removed on delete —
 * it's tombstoned instead, so remote sites that reference it (as an origin
 * for their own inserts) can still resolve position deterministically.
 */
export interface CRDTChar {
    id: CharId;
    value: string;
    originId: CharId | null;
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
//# sourceMappingURL=types.d.ts.map