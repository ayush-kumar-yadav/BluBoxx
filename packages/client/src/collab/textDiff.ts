/**
 * Finds the minimal {from, to, insert} edit that transforms `oldText` into
 * `newText`, by trimming the common prefix and common suffix. Works for
 * single-character CRDT ops (our case) and generalizes fine to larger
 * batches later (e.g. paste) without needing a real diff algorithm, since
 * CRDT ops always describe a contiguous change to one document.
 */
export function computeTextDiff(
  oldText: string,
  newText: string,
): { from: number; to: number; insert: string } | null {
  if (oldText === newText) return null;

  const minLen = Math.min(oldText.length, newText.length);

  let prefixLen = 0;
  while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) {
    prefixLen += 1;
  }

  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > prefixLen && newEnd > prefixLen && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  return {
    from: prefixLen,
    to: oldEnd,
    insert: newText.slice(prefixLen, newEnd),
  };
}