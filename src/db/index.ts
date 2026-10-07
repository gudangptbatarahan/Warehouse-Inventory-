import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

// Add global connection pool caching to persist across hot-reloads
declare global {
  var _postgresPool: Pool | undefined;
}

// Function to create or retrieve the connection pool.
export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      port: 5432,
      max: 10,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 3000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      allowExitOnIdle: false,
    });

    // Prevent unhandled pool-level errors from crashing the application
    global._postgresPool.on('error', (err) => {
      // Quietly handle idle pool client resets/disconnects
      if (
        err?.message?.includes('EPIPE') || 
        err?.message?.includes('ECONNRESET') ||
        err?.message?.includes('Connection terminated')
      ) {
        return;
      }
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

// Create or retrieve the pool instance.
export const pool = createPool();

// Initialize Drizzle with the pool and schema.
export const db = drizzle(pool, { schema });

/**
 * Executes a database operation with bounded retry for transient socket/connection drops (e.g. EPIPE, ECONNRESET).
 */
export async function withDbRetry<T>(operation: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      const fullText = (
        (err?.message || '') + ' ' + 
        (err?.cause?.message || '') + ' ' + 
        (err?.cause?.code || '') + ' ' + 
        (err?.code || '') + ' ' + 
        String(err)
      ).toLowerCase();

      const isTransient = 
        fullText.includes('epipe') || 
        fullText.includes('econnreset') || 
        fullText.includes('econnrefused') || 
        fullText.includes('57p01') || 
        fullText.includes('08006') || 
        fullText.includes('08001') || 
        fullText.includes('connection terminated') ||
        fullText.includes('closed the connection') ||
        fullText.includes('socket has been ended') ||
        fullText.includes('timeout') ||
        fullText.includes('cannot use a pool after calling end');

      if (!isTransient || attempt === maxAttempts) {
        throw err;
      }

      // Short delay before retrying with fresh connection from pool: 300ms, 600ms
      const delay = Math.min(300 * Math.pow(2, attempt - 1) + Math.random() * 100, 2000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
