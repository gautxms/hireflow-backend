import dotenv from 'dotenv';
import { initializeDatabase } from './config/db.js';
import { createApp } from './server.js';

// Load environment variables FIRST
dotenv.config();

const PORT = process.env.PORT || 8080;

// Initialize and start
async function start() {
  // Initialize database (but don't crash if it fails)
  try {
    console.log('Initializing database...');
    await initializeDatabase();
    console.log('✓ Database initialized successfully');
  } catch (error) {
    console.warn('⚠ Database initialization error:', error.message);
    console.warn('Server will continue running. Database connection will be retried on first query.');
  }

  // Create the Express app
  const app = createApp();

  // Start server (always succeeds, regardless of DB status)
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ Server running on 0.0.0.0:${PORT}`);
    console.log(`✓ Frontend: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
    console.log(`✓ NODE_ENV: ${process.env.NODE_ENV}`);
    
    // Database URL status (critical for debugging)
    if (process.env.DATABASE_URL) {
      const safeUrl = process.env.DATABASE_URL.replace(/:[^@]+@/, ':***@');
      console.log(`✓ DATABASE_URL: ${safeUrl}`);
      console.log(`✓ Is Railway DB: ${process.env.DATABASE_URL.includes('railway') ? 'YES' : 'NO'}`);
    } else {
      console.log(`⚠ DATABASE_URL: NOT SET (database queries will fail)`);
    }
    
    console.log(`✓ JWT_SECRET: ${process.env.JWT_SECRET ? '✓ Set' : '⚠ NOT SET'}`);
    console.log('[SERVER] Ready for connections');
  });
}

start();
