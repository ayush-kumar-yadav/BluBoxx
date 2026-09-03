import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';

interface RemoteCursor {
  pos: number;
  label: string;
  color: string;
}

export const setCursorEffect = StateEffect.define<{ siteId: string } & RemoteCursor>();
export const removeCursorEffect = StateEffect.define<{ siteId: string }>();

const CURSOR_COLORS = ['#e57373', '#64b5f6', '#81c784', '#ffb74d', '#ba68c8', '#4db6ac'];

/** Deterministic color per site id, so a given user's cursor color stays stable. */
export function colorForSite(siteId: string): string {
  let hash = 0;
  for (let i = 0; i < siteId.length; i += 1) {
    hash = (hash * 31 + siteId.charCodeAt(i)) >>> 0;
  }
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}

class CursorWidget extends WidgetType {
  constructor(
    private readonly color: string,
    private readonly label: string,
  ) {
    super();
  }

  eq(other: CursorWidget): boolean {
    return other.color === this.color && other.label === this.label;
  }

  toDOM(): HTMLElement {
    const caret = document.createElement('span');
    caret.style.position = 'relative';
    caret.style.borderLeft = `2px solid ${this.color}`;
    caret.style.marginLeft = '-1px';
    caret.style.height = '1.2em';
    caret.style.display = 'inline-block';
    caret.style.verticalAlign = 'text-bottom';

    const tag = document.createElement('span');
    tag.textContent = this.label;
    tag.style.position = 'absolute';
    tag.style.top = '-1.15em';
    tag.style.left = '-1px';
    tag.style.fontSize = '10px';
    tag.style.lineHeight = '1.4';
    tag.style.padding = '0 4px';
    tag.style.borderRadius = '3px';
    tag.style.background = this.color;
    tag.style.color = '#fff';
    tag.style.whiteSpace = 'nowrap';
    caret.appendChild(tag);

    return caret;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Holds remote cursors keyed by site id. Positions are re-mapped through
 * every document change (tr.changes.mapPos) so a cursor stays anchored to
 * the right spot even as local or remote edits shift the text around it -
 * without this, a remote insert earlier in the doc would leave every
 * cursor decoration pointing at the wrong character.
 */
export const cursorsField = StateField.define<Map<string, RemoteCursor>>({
  create() {
    return new Map();
  },
  update(value, tr) {
    let map = value;

    if (tr.docChanged) {
      const remapped = new Map<string, RemoteCursor>();
      for (const [siteId, info] of map) {
        remapped.set(siteId, { ...info, pos: tr.changes.mapPos(info.pos) });
      }
      map = remapped;
    }

    for (const effect of tr.effects) {
      if (effect.is(setCursorEffect)) {
        const { siteId, pos, label, color } = effect.value;
        const next = new Map(map);
        next.set(siteId, { pos, label, color });
        map = next;
      } else if (effect.is(removeCursorEffect)) {
        const next = new Map(map);
        next.delete(effect.value.siteId);
        map = next;
      }
    }

    return map;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (map): DecorationSet => {
      const ranges = Array.from(map.values()).map((info) =>
        Decoration.widget({ widget: new CursorWidget(info.color, info.label), side: 1 }).range(info.pos),
      );
      return Decoration.set(ranges, true);
    }),
});