import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorState, Annotation } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { io, Socket } from 'socket.io-client';
import { RGA } from '@bluboxx/shared';
import type { CRDTOp, OpMessage, RunResult } from '@bluboxx/shared';
import { computeTextDiff } from './textDiff.js';
import { SERVER_URL } from '../config.js';
import { colorForSite, cursorsField, removeCursorEffect, setCursorEffect } from './cursorPresence.js';

export type Role = 'interviewer' | 'candidate' | 'pending';

// Tags a transaction as having been generated FROM a remote CRDT op, so the
// local-edit listener below can recognize and skip it - prevents the
// broadcast echo loop described in useCollaborativeEditor's docs.
const remoteUpdate = Annotation.define<boolean>();

export function useCollaborativeEditor(roomId: string, interviewerToken: string | null) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const roleRef = useRef<Role>('pending'); // for use inside closures that shouldn't re-run on role change

  const [role, setRole] = useState<Role>('pending');
  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!containerRef.current) return;

    const siteId = crypto.randomUUID();
    const rga = new RGA(siteId);
    const socket: Socket = io(SERVER_URL);
    socketRef.current = socket;

    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: '',
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          javascript(),
          cursorsField,
          EditorView.updateListener.of((update) => {
            const isEcho = update.transactions.some((tr) => tr.annotation(remoteUpdate));

            if (update.docChanged && !isEcho) {
              let offset = 0;
              update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
                const from = fromA + offset;
                const to = toA + offset;

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
            }

            // Broadcast cursor position on any selection change - typing
            // moves the caret too, so this covers "where is everyone
            // looking/typing right now," not just explicit clicks.
            // Remote cursor updates arrive as StateEffects, not selection
            // changes, so this can't loop back on itself.
            if (update.selectionSet) {
              const pos = update.state.selection.main.head;
              socket.emit('cursor', {
                roomId,
                siteId,
                pos,
                label: roleRef.current === 'interviewer' ? 'Interviewer' : 'Candidate',
              });
            }
          }),
        ],
      }),
    });
    viewRef.current = view;

    function broadcastOp(op: CRDTOp) {
      const msg: OpMessage = { roomId, op, senderSite: siteId };
      socket.emit('op', msg);
    }

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
      setConnected(true);
      socket.emit('join-room', { roomId, interviewerToken: interviewerToken ?? undefined, siteId });
    });

    socket.on('disconnect', () => setConnected(false));

    // Server is the source of truth for role - it checked the token
    // against the room record, the client doesn't self-assign this.
    socket.on('role', (serverRole: Role) => {
      roleRef.current = serverRole;
      setRole(serverRole);
    });

    socket.on('op-log', (ops: CRDTOp[]) => {
      rga.applyOpLog(ops);
      syncEditorToRga();
    });

    socket.on('op', (msg: OpMessage) => {
      if (msg.senderSite === siteId) return;
      rga.applyRemote(msg.op);
      syncEditorToRga();
    });

    socket.on('cursor', (payload: { siteId: string; pos: number; label: string }) => {
      view.dispatch({
        effects: setCursorEffect.of({
          siteId: payload.siteId,
          pos: Math.min(payload.pos, view.state.doc.length),
          label: payload.label,
          color: colorForSite(payload.siteId),
        }),
      });
    });

    socket.on('cursor-remove', (payload: { siteId: string }) => {
      view.dispatch({ effects: removeCursorEffect.of({ siteId: payload.siteId }) });
    });

    // Only ever received if the server placed this socket in the
    // interviewer-only room - a candidate connection never gets this event.
    socket.on('notes', (text: string) => setNotes(text));

    socket.on('run-started', () => {
      setRunning(true);
      setRunResult(null);
    });
    socket.on('run-result', (result: RunResult) => {
      setRunning(false);
      setRunResult(result);
    });

    return () => {
      socket.disconnect();
      view.destroy();
      socketRef.current = null;
      viewRef.current = null;
    };
  }, [roomId, interviewerToken]);

  const runCode = useCallback(
    (language: string) => {
      const socket = socketRef.current;
      const view = viewRef.current;
      if (!socket || !view) return;
      const code = view.state.doc.toString();
      socket.emit('run-code', { roomId, code, language });
    },
    [roomId],
  );

  const updateNotes = useCallback(
    (text: string) => {
      setNotes(text); // optimistic local update
      socketRef.current?.emit('notes-update', { roomId, text });
    },
    [roomId],
  );

  return { containerRef, role, connected, running, runResult, runCode, notes, updateNotes };
}