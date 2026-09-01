import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home.js';
import Room from './pages/Room.js';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/room/:roomId" element={<Room />} />
    </Routes>
  );
}