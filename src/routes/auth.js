import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { generateToken } from '../middleware/auth.js';
import { sendVerificationEmail } from '../services/email.js';

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { email, password, firstName } = req.body;

  console.log('[SIGNUP] Request received for email:', email);

  // Validation
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    console.log('[SIGNUP] Checking if user exists...');
    
    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      console.log('[SIGNUP] User already exists:', email);
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
    console.log('[SIGNUP] Hashing password...');
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    console.log('[SIGNUP] Creating user in database...');
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email.toLowerCase(), passwordHash]
    );

    const user = result.rows[0];
    const token = generateToken(user.id, user.email);

    console.log('[SIGNUP] ✓ User created:', user.email);

    // Send verification email
    console.log('[SIGNUP] Sending verification email...');
    const emailResult = await sendVerificationEmail(user.email, firstName || 'there');

    if (emailResult.success) {
      console.log('[SIGNUP] ✓ Email sent successfully');
    } else {
      console.error('[SIGNUP] ⚠ Email failed (non-fatal):', emailResult.error);
    }

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email },
      emailSent: emailResult.success,
      message: 'Account created. Check your email for verification link.',
    });
  } catch (error) {
    console.error('[SIGNUP] ✗ ERROR:', error.message);
    console.error('[SIGNUP] ✗ Code:', error.code);
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

// POST /api/auth/verify-email
router.post('/verify-email', async (req, res) => {
  const { email } = req.body;

  console.log('[VERIFY] Request received for email:', email);

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    console.log('[VERIFY] Marking email as verified...');
    
    const result = await pool.query(
      'UPDATE users SET email_verified = true, email_verified_at = NOW() WHERE email = $1 RETURNING id, email, email_verified',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      console.log('[VERIFY] User not found:', email);
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    console.log('[VERIFY] ✓ Email verified:', user.email);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully!',
      user: { id: user.id, email: user.email, email_verified: user.email_verified }
    });
  } catch (error) {
    console.error('[VERIFY] ✗ ERROR:', error.message);
    res.status(500).json({ error: 'Verification failed' });
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
