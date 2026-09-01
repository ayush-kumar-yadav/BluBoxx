import { describe, it, expect } from 'vitest';
import { RGA } from './crdt.js';

/**
 * These are the tests that matter most for this whole project - they prove
 * the "conflict-free" guarantee actually holds. Fill these in alongside
 * the TODOs in crdt.ts; don't consider Week 1 done until they pass.
 */
describe('RGA convergence', () => {
  it.todo('two replicas applying the same ops in different order converge to the same string');
  it.todo('concurrent inserts at the same origin resolve deterministically on all replicas');
  it.todo('delete then receiving a late insert that originated before it still converges');
  it.todo('applying the same op twice (duplicate delivery) is idempotent');
});
