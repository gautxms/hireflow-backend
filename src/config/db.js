import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

// DEBUG: Log database configuration
const DATABASE_URL = process.env.DATABASE_URL;
const NODE_ENV = process.env.NODE_ENV;

console.log('[DB] Initializing pool...');
console.log('[DB] NODE_ENV:', NODE_ENV);
console.log('[DB] DATABASE_URL present:', !!DATABASE_URL);
if (DATABASE_URL) {
  // Log safe version (hide password)
  const safeUrl = DATABASE_URL.replace(/:[^@]+@/, ':***@');
  console.log('[DB] Connection string:', safeUrl);
  console.log('[DB] Is Railway:', DATABASE_URL.includes('railway') ? 'YES' : 'NO');
}

// CRITICAL: Pool MUST use DATABASE_URL
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

console.log('[DB] Pool created successfully');

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
  console.error('[DB] Error code:', err.code);
});

export default pool;

export async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email_verified BOOLEAN DEFAULT false,
        email_verified_at TIMESTAMP,
        subscription_status VARCHAR(50) DEFAULT 'trial',
        paddle_customer_id VARCHAR(255),
        paddle_subscription_id VARCHAR(255),
        trial_ends_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_paddle_customer ON users(paddle_customer_id);
      CREATE INDEX IF NOT EXISTS idx_users_paddle_subscription ON users(paddle_subscription_id);
    `);

    // Add email_verified column if it doesn't exist (for existing databases)
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;
    `);
    console.log('✓ Database schema created/verified');
  } catch (error) {
    console.error('Database initialization error:', error.message);
    // Don't throw - let server continue. DB connection will be retried on first query.
    // This is critical for cloud deployments where DB might be starting simultaneously.
  }
}
