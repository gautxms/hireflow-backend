import nodemailer from 'nodemailer';

// Configure transporter for Hostinger
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_PORT === '465', // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Test connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('[EMAIL] SMTP connection failed:', error.message);
  } else {
    console.log('[EMAIL] ✓ SMTP connection verified');
  }
});

/**
 * Send verification email after signup
 */
export async function sendVerificationEmail(email, firstName = 'there') {
  try {
    console.log('[EMAIL] Sending verification email to:', email);

    const verificationLink = `${process.env.FRONTEND_URL}/verify?email=${encodeURIComponent(email)}`;

    const info = await transporter.sendMail({
      from: `"HireFlow" <${process.env.EMAIL_FROM || 'hello@gfactai.com'}>`,
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
    });

    console.log('[EMAIL] ✓ Verification email sent! Message ID:', info.messageId);
    console.log('[EMAIL] ✓ Sent to:', email);
    console.log('[EMAIL] ✓ CC to: gautam@hireflow.dev');
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EMAIL] ✗ Failed to send verification email');
    console.error('[EMAIL] ✗ Error:', error.message);
    console.error('[EMAIL] ✗ Code:', error.code);
    return { success: false, error: error.message };
  }
}

/**
 * Send welcome email after verification
 */
export async function sendWelcomeEmail(email, firstName = 'there') {
  try {
    console.log('[EMAIL] Sending welcome email to:', email);

    const info = await transporter.sendMail({
      from: `"HireFlow" <${process.env.EMAIL_FROM || 'hello@gfactai.com'}>`,
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
                  <a href="https://hireflow.dev/dashboard" class="button">Go to Dashboard</a>
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
      text: `Your HireFlow account is ready! Go to https://hireflow.dev/dashboard`,
    });

    console.log('[EMAIL] ✓ Welcome email sent! Message ID:', info.messageId);
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
    console.log('[EMAIL] Sending password reset email to:', email);

    const info = await transporter.sendMail({
      from: `"HireFlow" <${process.env.EMAIL_FROM || 'hello@gfactai.com'}>`,
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
    });

    console.log('[EMAIL] ✓ Password reset email sent!');
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EMAIL] ✗ Failed to send password reset email:', error.message);
    return { success: false, error: error.message };
  }
}
