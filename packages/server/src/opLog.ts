import type { CRDTOp } from '@bluboxx/shared';

// In-memory, keyed by roomId.
// TODO (Week 3): move to Redis (hot path) with a Mongo write-behind for
// durability - an in-memory log doesn't survive a restart and won't work
// once there's more than one server instance.
const roomOpLogs = new Map<string, CRDTOp[]>();

export function getOpLog(roomId: string): CRDTOp[] {
  let log = roomOpLogs.get(roomId);
  if (!log) {
    log = [];
    roomOpLogs.set(roomId, log);
  }
  return log;
}

export function appendOps(roomId: string, ops: CRDTOp[]): void {
  getOpLog(roomId).push(...ops);
}