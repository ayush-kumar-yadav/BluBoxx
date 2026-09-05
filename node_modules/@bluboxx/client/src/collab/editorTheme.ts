import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// Mirrors the CSS custom properties in index.css - kept as literal hex
// here since CodeMirror themes are plain JS objects, not CSS, and can't
// read var(--x) at this layer.
const bg = '#1a1a1a';
const bgElevated = '#202020';
const fg = '#f5f5f5';
const muted = '#999999';
const border = '#333333';
const accent = '#39f52e';
const selection = 'rgba(57, 245, 46, 0.15)';

export const bluboxxEditorTheme = EditorView.theme(
  {
    '&': { backgroundColor: bg, color: fg, height: '100%' },
    '.cm-content': { caretColor: accent, fontFamily: '"JetBrains Mono", ui-monospace, monospace', padding: '12px 0' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: accent },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: selection,
    },
    '.cm-gutters': { backgroundColor: bgElevated, color: muted, border: 'none', borderRight: `1px solid ${border}` },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.05)' },
    '.cm-scroller': { fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: '13.5px', lineHeight: '1.6' },
  },
  { dark: true },
);

export const bluboxxHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: accent },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#7ee787' },
  { tag: [t.string, t.special(t.string)], color: '#ffb74d' },
  { tag: t.comment, color: muted, fontStyle: 'italic' },
  { tag: [t.number, t.bool, t.null], color: '#79c0ff' },
  { tag: t.operator, color: fg },
  { tag: [t.className, t.typeName], color: '#d2a8ff' },
  { tag: t.variableName, color: fg },
  { tag: t.propertyName, color: '#79c0ff' },
]);

export const bluboxxEditorExtensions = [bluboxxEditorTheme, syntaxHighlighting(bluboxxHighlightStyle)];