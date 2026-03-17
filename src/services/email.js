import nodemailer from 'nodemailer';

// Configure transporter for Hostinger
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || 'hello@gfactai.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://hireflow.dev';

console.log('[EMAIL] ================================');
console.log('[EMAIL] Email Service Initialization');
console.log('[EMAIL] ================================');
console.log('[EMAIL] Host:', SMTP_HOST || '✗ NOT SET');
console.log('[EMAIL] Port:', SMTP_PORT || '✗ NOT SET');
console.log('[EMAIL] User:', SMTP_USER ? SMTP_USER.split('@')[0] + '...@...' : '✗ NOT SET');
console.log('[EMAIL] Pass:', SMTP_PASS ? '✓ SET' : '✗ NOT SET');
console.log('[EMAIL] From:', EMAIL_FROM);
console.log('[EMAIL] Frontend:', FRONTEND_URL);
console.log('[EMAIL] ================================');

// Validate env vars
if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.error('[EMAIL] ⚠️  CRITICAL: Missing SMTP configuration!');
  console.error('[EMAIL] Email will not work until configured.');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // true for 465 (SSL), false for 587 (TLS)
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  // Connection pool settings
  pool: {
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 5,
  },
  // Timeout settings (critical for Railway stability)
  connectionTimeout: 30000, // 30 seconds
  socketTimeout: 30000, // 30 seconds
  greetingTimeout: 30000, // 30 seconds for initial connection
  authMethod: 'login', // Hostinger uses LOGIN auth method
  // TLS settings for Railway environment
  tls: {
    rejectUnauthorized: false, // Critical for Railway firewall/proxy
    minVersion: 'TLSv1.2',
  },
});

console.log('[EMAIL] Transporter configured');

// Test connection with detailed error handling
console.log('[EMAIL] Testing SMTP connection...');
transporter.verify((error, success) => {
  if (error) {
    console.error('[EMAIL] ✗ SMTP verification failed!');
    console.error('[EMAIL] ✗ Error:', error.message);
    console.error('[EMAIL] ✗ Code:', error.code);
    if (error.command) console.error('[EMAIL] ✗ Command:', error.command);
    if (error.response) console.error('[EMAIL] ✗ Response:', error.response);
    
    // Helpful debugging
    switch (error.code) {
      case 'ECONNREFUSED':
        console.error('[EMAIL] 💡 Likely cause: Wrong host or port');
        break;
      case 'ETIMEDOUT':
        console.error('[EMAIL] 💡 Likely cause: Firewall blocking port', SMTP_PORT);
        break;
      case 'ENOTFOUND':
        console.error('[EMAIL] 💡 Likely cause: Invalid SMTP host:', SMTP_HOST);
        break;
      case 'EAUTH':
        console.error('[EMAIL] 💡 Likely cause: Invalid credentials');
        break;
      default:
        console.error('[EMAIL] 💡 Check Hostinger email settings');
    }
  } else if (success) {
    console.log('[EMAIL] ✓ SMTP connection verified!');
    console.log('[EMAIL] ✓ Email service ready');
  }
});

/**
 * Retry helper with exponential backoff
 */
async function sendWithRetry(mailOptions, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[EMAIL] Sending (attempt ${attempt}/${maxRetries})...`);
      const result = await transporter.sendMail(mailOptions);
      console.log('[EMAIL] ✓ Email sent successfully on attempt', attempt);
      console.log('[EMAIL] Message ID:', result.messageId);
      return result;
    } catch (error) {
      lastError = error;
      console.error(`[EMAIL] ✗ Attempt ${attempt} failed`);
      console.error('[EMAIL] ✗ Error:', error.message);
      console.error('[EMAIL] ✗ Code:', error.code);
      
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s backoff
        console.log(`[EMAIL] ⏳ Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  // All retries failed
  console.error('[EMAIL] ✗ All retry attempts failed');
  throw lastError;
}

/**
 * Send verification email after signup
 */
export async function sendVerificationEmail(email, firstName = 'there') {
  try {
    console.log('[EMAIL] ========================================');
    console.log('[EMAIL] Verification Email');
    console.log('[EMAIL] ========================================');
    console.log('[EMAIL] To:', email);
    console.log('[EMAIL] Name:', firstName);

    const verificationLink = `${FRONTEND_URL}/verify?email=${encodeURIComponent(email)}`;
    console.log('[EMAIL] Link:', verificationLink);

    const mailOptions = {
      from: `"HireFlow" <${EMAIL_FROM}>`,
      to: email,
      cc: 'gautam@hireflow.dev',
      subject: '✨ Verify Your HireFlow Account',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb; border-radius: 8px; }
              .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
              .header h1 { margin: 0; font-size: 28px; }
              .content { background: white; padding: 30px; border-radius: 0 0 8px 8px; }
              .button { display: inline-block; background: #0f172a; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
              .button:hover { background: #1e293b; }
              .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
              .code { background: #f3f4f6; padding: 10px 15px; border-radius: 4px; font-family: monospace; font-size: 14px; margin: 15px 0; word-break: break-all; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>HireFlow</h1>
                <p>Email Verification</p>
              </div>
              <div class="content">
                <p>Hi ${firstName},</p>
                <p>Welcome to HireFlow! We're excited to have you on board.</p>
                <p>Your account has been created successfully. Click the button below to verify your email and activate your account:</p>
                <center>
                  <a href="${verificationLink}" class="button">Verify Email</a>
                </center>
                <p>Or copy and paste this link in your browser:</p>
                <div class="code">${verificationLink}</div>
                <p><strong>This link expires in 24 hours.</strong></p>
                <p>If you didn't create a HireFlow account, please ignore this email.</p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                <p style="font-size: 12px; color: #666;">
                  Questions? Reply to this email or contact us at <strong>${EMAIL_FROM}</strong>
                </p>
              </div>
              <div class="footer">
                <p>&copy; 2026 HireFlow. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `Verify your HireFlow account here: ${verificationLink}`,
    };

    const info = await sendWithRetry(mailOptions, 3);
    console.log('[EMAIL] ✓ Verification email sent!');
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EMAIL] ✗ Failed to send verification email');
    console.error('[EMAIL] ✗ Error:', error.message);
    console.error('[EMAIL] ✗ Full error:', JSON.stringify(error, null, 2));
    return { success: false, error: error.message };
  }
}

/**
 * Send welcome email after verification
 */
export async function sendWelcomeEmail(email, firstName = 'there') {
  try {
    console.log('[EMAIL] ========================================');
    console.log('[EMAIL] Welcome Email');
    console.log('[EMAIL] ========================================');
    console.log('[EMAIL] To:', email);

    const mailOptions = {
      from: `"HireFlow" <${EMAIL_FROM}>`,
      to: email,
      cc: 'gautam@hireflow.dev',
      subject: '🚀 Your HireFlow Account is Ready!',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb; border-radius: 8px; }
              .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
              .header h1 { margin: 0; font-size: 28px; }
              .content { background: white; padding: 30px; border-radius: 0 0 8px 8px; }
              .button { display: inline-block; background: #0f172a; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
              .button:hover { background: #1e293b; }
              .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>HireFlow</h1>
                <p>Account Activated!</p>
              </div>
              <div class="content">
                <p>Hi ${firstName},</p>
                <p>Your HireFlow account is now fully activated! 🎉</p>
                <p>You're all set to start screening resumes. Transform your hiring process:</p>
                <ul>
                  <li>Upload resumes instantly</li>
                  <li>Get AI-powered rankings</li>
                  <li>Reduce hiring time from weeks to minutes</li>
                </ul>
                <center>
                  <a href="${FRONTEND_URL}/dashboard" class="button">Go to Dashboard</a>
                </center>
                <p><strong>Need help?</strong> Check out our help center or reply to this email.</p>
                <p>Happy screening!</p>
                <p>— The HireFlow Team</p>
              </div>
              <div class="footer">
                <p>&copy; 2026 HireFlow. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `Your HireFlow account is ready! Go to ${FRONTEND_URL}/dashboard`,
    };

    const info = await sendWithRetry(mailOptions, 3);
    console.log('[EMAIL] ✓ Welcome email sent!');
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EMAIL] ✗ Failed to send welcome email:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email, resetLink) {
  try {
    console.log('[EMAIL] ========================================');
    console.log('[EMAIL] Password Reset Email');
    console.log('[EMAIL] ========================================');
    console.log('[EMAIL] To:', email);
    console.log('[EMAIL] Link:', resetLink);

    const mailOptions = {
      from: `"HireFlow" <${EMAIL_FROM}>`,
      to: email,
      subject: 'Reset Your HireFlow Password',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb; border-radius: 8px; }
              .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
              .content { background: white; padding: 30px; border-radius: 0 0 8px 8px; }
              .button { display: inline-block; background: #0f172a; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
              .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>HireFlow</h1>
              </div>
              <div class="content">
                <h2>Reset Your Password</h2>
                <p>We received a request to reset your HireFlow password. Click the button below to create a new password:</p>
                <center>
                  <a href="${resetLink}" class="button">Reset Password</a>
                </center>
                <p>This link expires in 1 hour.</p>
                <p>If you didn't request a password reset, please ignore this email.</p>
              </div>
              <div class="footer">
                <p>&copy; 2026 HireFlow. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `Reset your password here: ${resetLink}`,
    };

    const info = await sendWithRetry(mailOptions, 3);
    console.log('[EMAIL] ✓ Password reset email sent!');
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EMAIL] ✗ Failed to send password reset email:', error.message);
    return { success: false, error: error.message };
  }
}
