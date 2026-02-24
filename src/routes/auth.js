import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { generateToken } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  // DEBUG: Log signup attempt
  console.log('[SIGNUP] Request received for email:', email);
  console.log('[SIGNUP] Pool has connectionString:', !!pool?.connectionString);

  // Validation
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    console.log('[SIGNUP] Attempting database query...');
    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email.toLowerCase(), passwordHash]
    );

    const user = result.rows[0];
    const token = generateToken(user.id, user.email);

    console.log('[SIGNUP] Success! User created:', user.email);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    console.error('[SIGNUP] ERROR:', error.message);
    console.error('[SIGNUP] Error code:', error.code);
    console.error('[SIGNUP] Full error:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // DEBUG: Log login attempt
  console.log('[LOGIN] Request received for email:', email);

  // Validation
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    console.log('[LOGIN] Querying database for user...');
    // Find user
    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate token
    const token = generateToken(user.id, user.email);

    console.log('[LOGIN] Success! User authenticated:', user.email);
    res.status(200).json({
      token,
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    console.error('[LOGIN] ERROR:', error.message);
    console.error('[LOGIN] Error code:', error.code);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me (protected route example)
router.get('/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ user: req.user });
});

export default router;
