import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, hashPassword, toPublicUser } from './models/User.js';

export interface JwtPayload {
  sub: string;
  name: string;
  email: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set - check packages/server/.env');
  return secret;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: '30d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

/**
 * Kept simple on purpose for this project's scope: one long-lived (30d)
 * JWT handed back on login/signup and stored client-side (see
 * client/src/lib/auth.tsx), attached as an Authorization header on
 * fetches and as socket.handshake.auth.token on the socket connection.
 * No refresh-token rotation or httpOnly cookie - a reasonable trade for
 * an interview-practice tool, not for something handling real payments
 * or PII beyond a name/email.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req.headers.authorization);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  req.userId = payload.sub;
  req.userName = payload.name;
  next();
}

export const authRouter = Router();

authRouter.post('/signup', async (req, res) => {
  const { email, password, name } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'email, password, and name are required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    res.status(409).json({ error: 'An account with that email already exists' });
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({ email, name: name.trim(), passwordHash });
  const token = signToken({ sub: user._id.toString(), name: user.name, email: user.email });
  res.status(201).json({ token, user: toPublicUser(user) });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  const valid = user ? await user.comparePassword(password) : false;
  if (!user || !valid) {
    // Same message either way - don't reveal whether the email is registered.
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const token = signToken({ sub: user._id.toString(), name: user.name, email: user.email });
  res.json({ token, user: toPublicUser(user) });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user: toPublicUser(user) });
});