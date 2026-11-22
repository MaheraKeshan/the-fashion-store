import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDatabase(): Promise<boolean> {
  if (!env.MONGODB_URI) {
    console.warn('MONGODB_URI is not configured. Starting API without database connection.');
    return false;
  }

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('MongoDB connected successfully.');
    return true;
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    return false;
  }
}

export function getDatabaseStatus(): 'connected' | 'disconnected' {
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
}

export async function assertProductionReplicaSet(): Promise<void> {
  if (env.NODE_ENV !== 'production') return;
  if (!mongoose.connection.db) throw new Error('MongoDB is not connected.');

  const hello = await mongoose.connection.db.admin().command({ hello: 1 }) as {
    setName?: string;
  };
  if (!hello.setName) {
    throw new Error(
      'Production MongoDB must use a replica set or Atlas deployment for transaction support.',
    );
  }
}