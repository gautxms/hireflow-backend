import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { generateToken } from '../middleware/auth.js';
import { sendVerificationEmail } from '../services/email.js';
import { validateRequest, signupSchema, loginSchema, verifyEmailSchema } from '../middleware/validation.js';
import { isValidEmailDomain } from '../utils/sanitize.js';

const router = express.Router();

// POST /api/auth/signup
// Validates input, creates user, sends verification email
router.post('/signup', validateRequest(signupSchema), async (req, res) => {
  const { email, password, firstName } = req.body;

  console.log('[SIGNUP] Request received for email:', email);

  try {
    // Validate email domain (additional domain check)
    if (!isValidEmailDomain(email)) {
      console.log('[SIGNUP] ✗ Invalid email domain:', email);
      return res.status(400).json({ error: 'Please use a valid email address' });
    }

    console.log('[SIGNUP] Checking if user exists...');
    
    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      console.log('[SIGNUP] ✗ User already exists:', email);
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    console.log('[SIGNUP] Hashing password...');
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    console.log('[SIGNUP] Creating user in database...');
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash]
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
    if (error.code === '23505') {
      // Unique constraint violation
      return res.status(409).json({ error: 'Email already registered' });
    }
    res.status(500).json({ error: 'Signup failed' });
  }
});

// POST /api/auth/login
// Validates input, authenticates user, returns JWT
router.post('/login', validateRequest(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  console.log('[LOGIN] Request received for email:', email);

  try {
    console.log('[LOGIN] Querying database for user...');
    
    // Find user
    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      console.log('[LOGIN] ✗ User not found:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      console.log('[LOGIN] ✗ Password mismatch for:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate token
    const token = generateToken(user.id, user.email);

    console.log('[LOGIN] ✓ Success! User authenticated:', user.email);
    res.status(200).json({
      token,
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    console.error('[LOGIN] ✗ ERROR:', error.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/verify-email
// Validates email parameter, marks email as verified
router.post('/verify-email', validateRequest(verifyEmailSchema), async (req, res) => {
  const { email } = req.body;

  console.log('[VERIFY] Request received for email:', email);

  try {
    // Update user: mark email as verified
    const result = await pool.query(
      'UPDATE users SET email_verified = true, email_verified_at = NOW() WHERE email = $1 RETURNING id, email, email_verified',
      [email]
    );

    if (result.rows.length === 0) {
      console.log('[VERIFY] ✗ User not found:', email);
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    console.log('[VERIFY] ✓ Email verified for:', user.email);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      user: { id: user.id, email: user.email, email_verified: user.email_verified }
    });
  } catch (error) {
    console.error('[VERIFY] ✗ ERROR:', error.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// GET /api/auth/me
// Protected route - requires valid JWT
router.get('/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ user: req.user });
});

export default router;
