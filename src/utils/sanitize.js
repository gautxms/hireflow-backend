/**
 * Backend sanitization utilities
 * These protect against XSS, HTML injection, and malicious input
 */

/**
 * Escape HTML special characters
 */
export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize filename for uploads
 * Remove potentially dangerous characters and path traversal attempts
 */
export function sanitizeFilename(filename) {
  if (!filename) return 'file';
  
  // Remove path traversal attempts
  filename = filename.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');
  
  // Allow only alphanumeric, dots, hyphens, underscores
  filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  
  // Remove leading/trailing dots (prevent .htaccess type attacks)
  filename = filename.replace(/^\.+/, '').replace(/\.+$/, '');
  
  // Limit length to prevent filesystem issues
  filename = filename.substring(0, 255);
  
  return filename || 'file';
}

/**
 * Validate MIME type is safe for resume processing
 */
export function isValidResumeMimeType(mimeType) {
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
  ];
  return allowedTypes.includes(mimeType);
}

/**
 * Validate file size (max 50MB)
 */
export function isValidFileSize(sizeBytes) {
  const MAX_SIZE = 50 * 1024 * 1024; // 50MB
  return sizeBytes > 0 && sizeBytes <= MAX_SIZE;
}

/**
 * Validate email is reasonable (not just technical RFC validity)
 * - Must have domain
 * - Domain must have TLD
 * - Not obviously fake (test@test.com)
 */
export function isValidEmailDomain(email) {
  if (!email || !email.includes('@')) return false;
  
  const [, domain] = email.split('@');
  if (!domain) return false;
  
  // Must have at least one dot (domain.tld)
  if (!domain.includes('.')) return false;
  
  // TLD must be at least 2 chars
  const parts = domain.split('.');
  const tld = parts[parts.length - 1];
  if (tld.length < 2) return false;
  
  // Block obviously fake domains
  const blocked = ['test.com', 'example.com', 'localhost', 'invalid.com'];
  if (blocked.includes(domain.toLowerCase())) return false;
  
  return true;
}

/**
 * Trim and normalize whitespace
 */
export function normalizeString(str) {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ');
}

/**
 * Log sanitization action for security auditing
 */
export function logSanitization(action, input, sanitized, context = {}) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[SANITIZE] ${action}:`, {
      inputLength: input ? input.length : 0,
      sanitizedLength: sanitized ? sanitized.length : 0,
      changed: input !== sanitized,
      context,
    });
  }
}
