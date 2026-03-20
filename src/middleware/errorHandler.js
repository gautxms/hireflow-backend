/**
 * Global error handler middleware
 * Catches all errors and returns safe responses
 */

export function errorHandler(err, req, res, next) {
  // Log the error
  console.error('[ERROR] Uncaught error:', err.message);
  console.error('[ERROR] Stack:', err.stack);

  // Don't send stack trace or internal details to client
  const statusCode = err.statusCode || 500;
  const userMessage = err.message || 'An error occurred';

  res.status(statusCode).json({
    error: userMessage,
    ...(process.env.NODE_ENV === 'development' && { details: err.message }),
  });
}

/**
 * 404 handler
 */
export function notFoundHandler(req, res) {
  console.log('[404] Route not found:', req.method, req.path);
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
  });
}

/**
 * Wrap async route handlers to catch errors
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
