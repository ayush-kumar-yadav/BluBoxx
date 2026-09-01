import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:4000';

export default function App() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(SERVER_URL);
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem' }}>
      <h1>BluBoxx</h1>
      <p>Server connection: {connected ? '✅ connected' : '❌ not connected'}</p>
      <p>
        {/* TODO (Week 1): mount CodeMirror here, wire local edits through
            RGA.localInsert/localDelete, broadcast ops over the socket,
            apply incoming ops via RGA.applyRemote. */}
        Editor goes here.
      </p>
    </div>
  );
}
