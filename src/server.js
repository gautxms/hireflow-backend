import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import paddleRoutes from './routes/paddle.js';
import { verifyToken } from './middleware/auth.js';

/**
 * Create and configure the Express app
 * Does NOT load dotenv or start the server
 * That's handled by index.js
 */
export function createApp() {
  const app = express();

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
  app.use('/api/paddle', paddleRoutes);

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

  return app;
}
