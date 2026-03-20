/**
 * File upload validation middleware
 * Checks MIME type, file size, and filename before processing
 */

import { isValidFileSize, isValidResumeMimeType, sanitizeFilename } from '../utils/sanitize.js';

/**
 * Validate uploaded file before processing
 * Expects multer middleware to provide file in req.file
 */
export function validateUploadedFile(req, res, next) {
  if (!req.file) {
    console.log('[UPLOAD] ✗ No file provided');
    return res.status(400).json({ error: 'No file provided' });
  }

  const { file } = req;
  const { size, mimetype, originalname } = file;

  console.log('[UPLOAD] Validating file:', {
    name: originalname,
    mimeType: mimetype,
    size: `${(size / 1024 / 1024).toFixed(2)}MB`,
  });

  // Validate MIME type
  if (!isValidResumeMimeType(mimetype)) {
    console.log('[UPLOAD] ✗ Invalid MIME type:', mimetype);
    return res.status(400).json({
      error: 'Invalid file type. Only PDF, DOCX, and DOC files are supported.',
      supported: ['PDF', 'DOCX', 'DOC'],
    });
  }

  // Validate file size
  if (!isValidFileSize(size)) {
    console.log('[UPLOAD] ✗ File too large:', size);
    return res.status(400).json({
      error: 'File too large. Maximum size is 50MB.',
      maxSize: '50MB',
      providedSize: `${(size / 1024 / 1024).toFixed(2)}MB`,
    });
  }

  // Sanitize filename
  const sanitized = sanitizeFilename(originalname);
  req.file.sanitizedName = sanitized;

  console.log('[UPLOAD] ✓ File validation passed');
  next();
}

/**
 * Validate upload endpoint exists and is accessible
 */
export function validateUploadEndpoint(req, res, next) {
  // Check user is authenticated
  if (!req.user) {
    console.log('[UPLOAD] ✗ Unauthorized upload attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check user has active subscription (if enforcing)
  // This will be checked in the upload handler itself
  
  next();
}
