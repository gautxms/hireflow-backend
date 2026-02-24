import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './config/db.js';
import authRoutes from './routes/auth.js';
import { verifyToken } from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());

// CORS Configuration
const allowedOrigins = [
  'https://hireflow.dev',
  'https://www.hireflow.dev',
  'http://localhost:5173',
  'http://localhost:8080',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);

// Protected example endpoint
app.get('/api/protected', verifyToken, (req, res) => {
  res.json({ message: 'This is protected', user: req.user });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

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
