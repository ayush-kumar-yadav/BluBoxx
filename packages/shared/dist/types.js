export function charIdEquals(a, b) {
    if (a === null || b === null)
        return a === b;
    return a.site === b.site && a.seq === b.seq;
}
export function charIdToString(id) {
    return `${id.site}:${id.seq}`;
}
export const SUPPORTED_LANGUAGES = [
    { id: 'javascript', label: 'JavaScript' },
    { id: 'typescript', label: 'TypeScript' },
    { id: 'python', label: 'Python 3' },
    { id: 'java', label: 'Java' },
    { id: 'cpp', label: 'C++' },
    { id: 'c', label: 'C' },
];
export const DEFAULT_LANGUAGE = 'javascript';
export function isSupportedLanguage(value) {
    return SUPPORTED_LANGUAGES.some((l) => l.id === value);
}
//# sourceMappingURL=types.js.map