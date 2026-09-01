import { useCollaborativeEditor } from './collab/useCollaborativeEditor.js';

// TODO (Week 2): real room IDs from the URL / room creation flow, instead
// of everyone sharing one hardcoded room.
const DEMO_ROOM_ID = 'demo-room';

export default function App() {
  const editorRef = useCollaborativeEditor(DEMO_ROOM_ID);

  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
      <h1>BluBoxx</h1>
      <p style={{ color: '#666', marginBottom: '1rem' }}>
        Open this page in two tabs and type in both - edits should sync live via the CRDT.
      </p>
      <div
        ref={editorRef}
        style={{
          border: '1px solid #ddd',
          borderRadius: 6,
          minHeight: 300,
          fontSize: 14,
        }}
      />
    </div>
  );
}