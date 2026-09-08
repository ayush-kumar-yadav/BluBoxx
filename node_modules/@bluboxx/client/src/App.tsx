import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/auth.js';
import { RequireAuth } from './components/RequireAuth.js';
import Home from './pages/Home.js';
import Room from './pages/Room.js';
import Login from './pages/Login.js';
import Signup from './pages/Signup.js';
import Profile from './pages/Profile.js';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
        <Route
          path="/room/:roomId"
          element={
            <RequireAuth>
              <Room />
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}