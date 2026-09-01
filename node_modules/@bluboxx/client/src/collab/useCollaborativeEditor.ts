import { useEffect, useRef } from 'react';
import { EditorState, Annotation } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { io, Socket } from 'socket.io-client';
import { RGA } from '@bluboxx/shared';
import type { CRDTOp, OpMessage } from '@bluboxx/shared';
import { computeTextDiff } from './textDiff.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:4000';

// Tags a transaction as having been generated FROM a remote CRDT op, so the
// local-edit listener below can recognize and skip it. Without this, every
// remote update would get re-encoded as a "local" edit and re-broadcast,
// causing an infinite echo loop between clients.
const remoteUpdate = Annotation.define<boolean>();

export function useCollaborativeEditor(roomId: string) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Stable per-session identity for this browser tab. Deliberately NOT
    // tied to socket.id - a reconnect gets a new socket.id, but ops already
    // authored under the old id must stay valid, so the CRDT site id needs
    // to outlive individual socket connections.
    const siteId = crypto.randomUUID();
    const rga = new RGA(siteId);

    const socket: Socket = io(SERVER_URL);

    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: '',
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          javascript(),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;

            // Skip: this transaction was us applying a REMOTE op, not the
            // user typing. Re-processing it here would re-broadcast
            // someone else's edit back out as if it were our own.
            const isEcho = update.transactions.some((tr) => tr.annotation(remoteUpdate));
            if (isEcho) return;

            // A single keystroke is one change; paste/autocomplete can
            // produce several. iterChanges gives each sub-range in the
            // ORIGINAL (pre-transaction) document's coordinates, so we
            // track a running offset to convert each into the correct
            // position in the CRDT's current visible text as we go.
            let offset = 0;
            update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
              const from = fromA + offset;
              const to = toA + offset;

              // Delete the replaced range, one char at a time. Deleting
              // repeatedly at `from` is correct: each deletion shifts the
              // next character into that same visible index.
              for (let i = from; i < to; i += 1) {
                const op = rga.localDelete(from);
                broadcastOp(op);
              }

              const text = inserted.toString();
              for (let i = 0; i < text.length; i += 1) {
                const op = rga.localInsert(from + i, text[i]);
                broadcastOp(op);
              }

              offset += text.length - (toA - fromA);
            });
          }),
        ],
      }),
    });

    function broadcastOp(op: CRDTOp) {
      const msg: OpMessage = { roomId, op, senderSite: siteId };
      socket.emit('op', msg);
    }

    // Applies an already-processed RGA state to the editor by diffing
    // against what's currently on screen, tagging the resulting transaction
    // so the updateListener above knows to ignore it.
    function syncEditorToRga() {
      const oldText = view.state.doc.toString();
      const newText = rga.toString();
      const diff = computeTextDiff(oldText, newText);
      if (!diff) return;
      view.dispatch({
        changes: { from: diff.from, to: diff.to, insert: diff.insert },
        annotations: remoteUpdate.of(true),
      });
    }

    socket.on('connect', () => {
      socket.emit('join-room', roomId);
    });

    // Full history replay on join - rebuilds this client's document from
    // scratch, including anything that happened before it connected.
    socket.on('op-log', (ops: CRDTOp[]) => {
      rga.applyOpLog(ops);
      syncEditorToRga();
    });

    // Live ops from other clients in the room, from this point forward.
    socket.on('op', (msg: OpMessage) => {
      if (msg.senderSite === siteId) return; // ignore our own echoed broadcast
      rga.applyRemote(msg.op);
      syncEditorToRga();
    });

    return () => {
      socket.disconnect();
      view.destroy();
    };
  }, [roomId]);

  return containerRef;
}