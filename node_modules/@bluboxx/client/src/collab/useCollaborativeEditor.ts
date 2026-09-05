import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorState, Annotation, Compartment, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { io, Socket } from 'socket.io-client';
import { RGA, DEFAULT_LANGUAGE } from '@bluboxx/shared';
import type { CRDTOp, OpMessage, RunResult } from '@bluboxx/shared';
import { computeTextDiff } from './textDiff.js';
import { SERVER_URL } from '../config.js';
import { colorForSite, cursorsField, removeCursorEffect, setCursorEffect } from './cursorPresence.js';
import { bluboxxEditorExtensions } from './editorTheme.js';

export type Role = 'interviewer' | 'candidate' | 'pending';
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

export interface Participant {
  siteId: string;
  role: 'interviewer' | 'candidate';
}

// Tags a transaction as having been generated FROM a remote CRDT op, so the
// local-edit listener below can recognize and skip it - prevents the
// broadcast echo loop described in useCollaborativeEditor's docs.
const remoteUpdate = Annotation.define<boolean>();

// Maps a language id (see @bluboxx/shared's SUPPORTED_LANGUAGES) to its
// CodeMirror syntax-highlighting extension. There's no dedicated "C"
// CodeMirror package - @codemirror/lang-cpp's grammar is a superset that
// highlights C fine, so `c` intentionally reuses `cpp()` here.
const LANGUAGE_EXTENSIONS: Record<string, () => Extension> = {
  javascript: () => javascript(),
  typescript: () => javascript({ typescript: true }),
  python: () => python(),
  cpp: () => cpp(),
  c: () => cpp(),
  java: () => java(),
};

function languageExtension(language: string): Extension {
  return (LANGUAGE_EXTENSIONS[language] ?? LANGUAGE_EXTENSIONS[DEFAULT_LANGUAGE])();
}

export function useCollaborativeEditor(roomId: string, interviewerToken: string | null) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const roleRef = useRef<Role>('pending'); // for use inside closures that shouldn't re-run on role change
  const siteIdRef = useRef<string>(''); // this client's own site id, for "(you)" labeling in presence UI
  const hasConnectedOnceRef = useRef(false); // distinguishes first-time "connecting" from a later dropped connection
  // One Compartment survives the whole hook lifetime so `changeLanguage`
  // can reconfigure just the language extension via view.dispatch, without
  // tearing down and rebuilding the entire EditorView (which would lose
  // undo history, scroll position, etc).
  const languageCompartmentRef = useRef(new Compartment());
  const languageRef = useRef(DEFAULT_LANGUAGE); // for runCode, which shouldn't re-render on every keystroke

  const [role, setRole] = useState<Role>('pending');
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [docReady, setDocReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [notes, setNotes] = useState('');
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [participants, setParticipants] = useState<Participant[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    setDocReady(false); // reset in case roomId/token changed and this effect re-ran

    const siteId = crypto.randomUUID();
    siteIdRef.current = siteId;
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
          languageCompartmentRef.current.of(languageExtension(languageRef.current)),
          cursorsField,
          bluboxxEditorExtensions,
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
      setConnectionStatus('connected');
      hasConnectedOnceRef.current = true;
      socket.emit('join-room', { roomId, interviewerToken: interviewerToken ?? undefined, siteId });
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setParticipants([]);
      // A drop AFTER we'd already connected once reads as "reconnecting,"
      // not the generic first-load "connecting" - genuinely different
      // situations for the user (mid-interview blip vs. just opening the link).
      setConnectionStatus(hasConnectedOnceRef.current ? 'reconnecting' : 'connecting');
    });

    // Server is the source of truth for role - it checked the token
    // against the room record, the client doesn't self-assign this.
    socket.on('role', (serverRole: Role) => {
      roleRef.current = serverRole;
      setRole(serverRole);
    });

    socket.on('op-log', (ops: CRDTOp[]) => {
      rga.applyOpLog(ops);
      syncEditorToRga();
      setDocReady(true);
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

    // Full participant list, re-sent by the server on every join/leave -
    // simplest correct approach for a room this small (at most a couple
    // of participants), versus diffing add/remove events client-side.
    socket.on('presence', (list: Participant[]) => setParticipants(list));

    // Authoritative language, pushed by the server both on join and
    // whenever anyone switches it (see 'language-change' below). Applies
    // to every socket in the room, so interviewer and candidate always
    // see the same syntax highlighting and Run Code target - even if this
    // client didn't initiate the switch itself.
    socket.on('language', (serverLanguage: string) => {
      languageRef.current = serverLanguage;
      setLanguage(serverLanguage);
      view.dispatch({
        effects: languageCompartmentRef.current.reconfigure(languageExtension(serverLanguage)),
      });
    });

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

  const runCode = useCallback(() => {
    const socket = socketRef.current;
    const view = viewRef.current;
    if (!socket || !view) return;
    const code = view.state.doc.toString();
    // Always the server-confirmed language, not local component state -
    // guarantees Run Code executes against whatever every participant is
    // currently looking at, even right after a switch.
    socket.emit('run-code', { roomId, code, language: languageRef.current });
  }, [roomId]);

  const changeLanguage = useCallback(
    (newLanguage: string) => {
      const socket = socketRef.current;
      const view = viewRef.current;
      if (!socket || !view) return;
      // Optimistic local update - reconfigure immediately rather than
      // waiting on the round trip, then the server's echoed 'language'
      // event (which the socket.io-client also delivers to the sender,
      // since index.ts uses io.to not socket.to) confirms/corrects it.
      languageRef.current = newLanguage;
      setLanguage(newLanguage);
      view.dispatch({
        effects: languageCompartmentRef.current.reconfigure(languageExtension(newLanguage)),
      });
      socket.emit('language-change', { roomId, language: newLanguage });
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

  return {
    containerRef,
    role,
    connected,
    connectionStatus,
    docReady,
    running,
    runResult,
    runCode,
    notes,
    updateNotes,
    language,
    changeLanguage,
    participants,
    mySiteId: siteIdRef.current,
  };
}