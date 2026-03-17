import nodemailer from 'nodemailer';
import { lookup } from 'dns';
import { promisify } from 'util';

// Force IPv4 only (Railway blocks IPv6)
const dnsLookup = promisify(lookup);

// Custom lookup function that ONLY returns IPv4 addresses
const ipv4OnlyLookup = async (hostname, options, callback) => {
  try {
    const result = await dnsLookup(hostname, { family: 4, all: false });
    callback(null, result.address, result.family);
  } catch (error) {
    callback(error);
  }
};

// Configure transporter for Hostinger + Railway
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.hostinger.com';
const SMTP_PORT_CONFIG = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : null;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || 'hello@gfactai.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://hireflow.dev';

// **CRITICAL FIX FOR RAILWAY**: Port 465 is blocked by Railway firewall
// Override to port 587 (STARTTLS) which is guaranteed to work
const SMTP_PORT = SMTP_PORT_CONFIG === 465 ? 587 : (SMTP_PORT_CONFIG || 587);
const USE_STARTTLS = SMTP_PORT === 587;

console.log('[EMAIL] ================================');
console.log('[EMAIL] Email Service Initialization');
console.log('[EMAIL] ================================');
console.log('[EMAIL] Host:', SMTP_HOST);
console.log('[EMAIL] Port:', SMTP_PORT, `(${USE_STARTTLS ? 'STARTTLS/TLS' : 'SSL'})`);
console.log('[EMAIL] User:', SMTP_USER ? SMTP_USER.split('@')[0] + '...@...' : '✗ NOT SET');
console.log('[EMAIL] Pass:', SMTP_PASS ? '✓ SET' : '✗ NOT SET');
console.log('[EMAIL] From:', EMAIL_FROM);
console.log('[EMAIL] Frontend:', FRONTEND_URL);
console.log('[EMAIL] DNS Resolution: IPv4 ONLY (Railway blocks IPv6)');
console.log('[EMAIL] Environment: Railway (port 465 → 587 auto-redirect)');
console.log('[EMAIL] ================================');

// Validate env vars
if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.error('[EMAIL] ⚠️  CRITICAL: Missing SMTP configuration!');
  console.error('[EMAIL] Email will not work until configured.');
  console.error('[EMAIL] ✗ SMTP_HOST:', SMTP_HOST ? '✓' : '✗ NOT SET');
  console.error('[EMAIL] ✗ SMTP_USER:', SMTP_USER ? '✓' : '✗ NOT SET');
  console.error('[EMAIL] ✗ SMTP_PASS:', SMTP_PASS ? '✓' : '✗ NOT SET');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  // Port 587 uses STARTTLS (secure: false), others use direct SSL (secure: true)
  secure: !USE_STARTTLS,
  // **CRITICAL FOR RAILWAY**: Custom DNS lookup - IPv4 ONLY
  lookup: ipv4OnlyLookup,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  // Railway-optimized connection settings
  connectionTimeout: 10000, // 10 seconds (Railway may be slow)
  socketTimeout: 10000, // 10 seconds
  greetingTimeout: 10000, // 10 seconds
  authMethod: 'login', // Hostinger requires LOGIN auth
  // TLS/SSL settings critical for Railway
  tls: {
    rejectUnauthorized: false, // Railway sits behind a proxy, don't reject certs
    minVersion: 'TLSv1.2',
  },
  // Minimal connection pool for stability
  pool: {
    maxConnections: 1, // Single connection to avoid Railway limits
    maxMessages: 50,
  },
  logger: false, // Disable nodemailer verbose logging
});

console.log('[EMAIL] ✓ Transporter created');

// Non-blocking verification (don't crash app if SMTP fails)
console.log('[EMAIL] Testing SMTP connection (non-blocking)...');
transporter.verify((error, success) => {
  if (error) {
    console.error('[EMAIL] ✗ SMTP verification failed');
    console.error('[EMAIL] ✗ Error:', error.message);
    console.error('[EMAIL] ✗ Code:', error.code);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('[EMAIL] 💡 Check: SMTP_HOST and SMTP_PORT are correct');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('[EMAIL] 💡 Check: Railway firewall may be blocking connection');
      console.error('[EMAIL] 💡 Retrying with port 587 (STARTTLS)...');
    } else if (error.code === 'EAUTH') {
      console.error('[EMAIL] 💡 Check: SMTP_USER and SMTP_PASS are correct');
    } else if (error.code === 'ENOTFOUND') {
      console.error('[EMAIL] 💡 Check: Invalid SMTP_HOST');
    }
    
    console.error('[EMAIL] ⚠️  Email may not work. Server continuing anyway.');
  } else {
    console.log('[EMAIL] ✓ SMTP connection verified!');
    console.log('[EMAIL] ✓ Ready to send emails');
  }
});

/**
 * Send email with automatic retry
 */
async function sendEmailWithRetry(mailOptions, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`[EMAIL] ✓ Email sent (attempt ${attempt}/${retries}) - Message ID:`, info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`[EMAIL] ✗ Attempt ${attempt}/${retries} failed:`, error.message);
      
      if (attempt < retries) {
        // Exponential backoff: 1s, 2s, 4s
        const waitMs = Math.pow(2, attempt - 1) * 1000;
        console.log(`[EMAIL] ⏳ Retrying in ${waitMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      } else {
        console.error(`[EMAIL] ✗ All ${retries} attempts failed for:`, mailOptions.to);
        return { success: false, error: error.message };
      }
    }
  }
}

/**
 * Send verification email after signup
 */
export async function sendVerificationEmail(email, firstName = 'there') {
  try {
    console.log('[EMAIL] Sending verification email to:', email);

    const verificationLink = `${FRONTEND_URL}/verify?email=${encodeURIComponent(email)}`;

    const mailOptions = {
      from: `"HireFlow" <${EMAIL_FROM}>`,
      to: email,
      cc: 'gautam@hireflow.dev',
      subject: '✨ Verify Your HireFlow Account',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
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
                  Questions? Reply to this email or contact us at <strong>hello@gfactai.com</strong>
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

    return await sendEmailWithRetry(mailOptions);
  } catch (error) {
    console.error('[EMAIL] ✗ Verification email error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send welcome email after verification
 */
export async function sendWelcomeEmail(email, firstName = 'there') {
  try {
    console.log('[EMAIL] Sending welcome email to:', email);

    const mailOptions = {
      from: `"HireFlow" <${EMAIL_FROM}>`,
      to: email,
      cc: 'gautam@hireflow.dev',
      subject: '🚀 Your HireFlow Account is Ready!',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
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

    return await sendEmailWithRetry(mailOptions);
  } catch (error) {
    console.error('[EMAIL] ✗ Welcome email error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email, resetLink) {
  try {
    console.log('[EMAIL] Sending password reset email to:', email);

    const mailOptions = {
      from: `"HireFlow" <${EMAIL_FROM}>`,
      to: email,
      subject: 'Reset Your HireFlow Password',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb; border-radius: 8px; }
              .content { background: white; padding: 30px; border-radius: 8px; }
              .button { display: inline-block; background: #0f172a; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
              .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
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
    };

    return await sendEmailWithRetry(mailOptions);
  } catch (error) {
    console.error('[EMAIL] ✗ Password reset email error:', error.message);
    return { success: false, error: error.message };
  }
}
