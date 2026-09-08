import mongoose from 'mongoose';

/**
 * Called once at server startup. Throws (and crashes the process) rather
 * than starting the HTTP/socket server against a DB that never connected -
 * silently limping along without persistence would be far more confusing
 * than a startup failure.
 */
export async function connectMongo(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set - check packages/server/.env');
  }
  await mongoose.connect(uri);
  console.log('MongoDB connected');
}