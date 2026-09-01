export function charIdEquals(a, b) {
    if (a === null || b === null)
        return a === b;
    return a.site === b.site && a.seq === b.seq;
}
export function charIdToString(id) {
    return `${id.site}:${id.seq}`;
}
//# sourceMappingURL=types.js.map