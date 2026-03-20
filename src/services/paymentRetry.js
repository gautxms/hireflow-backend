/**
 * Payment Retry Service
 * Handles failed payment recovery with exponential backoff
 */

import pool from '../config/db.js';

/**
 * Log a payment failure for later retry
 */
export async function logPaymentFailure(userId, transactionId, customerId, errorCode, errorMessage, amount, currency = 'USD') {
  try {
    console.log('[PAYMENT] Logging payment failure for user:', userId);
    
    // Calculate next retry time (1 hour from now)
    const nextRetryTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    const result = await pool.query(
      `INSERT INTO payment_attempts 
       (user_id, paddle_transaction_id, paddle_customer_id, amount, currency, status, error_code, error_message, next_retry_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [userId, transactionId, customerId, amount, currency, 'failed', errorCode, errorMessage, nextRetryTime]
    );
    
    console.log('[PAYMENT] ✓ Payment failure logged:', {
      paymentId: result.rows[0].id,
      userId,
      transactionId,
      nextRetry: nextRetryTime,
    });
    
    return result.rows[0].id;
  } catch (error) {
    console.error('[PAYMENT] ✗ Error logging payment failure:', error.message);
    throw error;
  }
}

/**
 * Find all payments due for retry
 */
export async function getPaymentsDueForRetry(limit = 10) {
  try {
    const result = await pool.query(
      `SELECT id, user_id, paddle_transaction_id, paddle_customer_id, amount, currency, error_code, retry_count
       FROM payment_attempts
       WHERE status = 'failed'
         AND next_retry_at <= NOW()
         AND retry_count < max_retries
       ORDER BY next_retry_at ASC
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  } catch (error) {
    console.error('[PAYMENT] ✗ Error fetching payments due for retry:', error.message);
    throw error;
  }
}

/**
 * Mark a payment retry as attempted
 */
export async function markPaymentRetryAttempted(paymentId) {
  try {
    await pool.query(
      `UPDATE payment_attempts 
       SET last_attempted_at = NOW(), retry_count = retry_count + 1
       WHERE id = $1`,
      [paymentId]
    );
  } catch (error) {
    console.error('[PAYMENT] ✗ Error marking retry attempt:', error.message);
    throw error;
  }
}

/**
 * Mark a payment as successful
 */
export async function markPaymentSuccess(paymentId) {
  try {
    console.log('[PAYMENT] Marking payment as successful:', paymentId);
    
    await pool.query(
      `UPDATE payment_attempts 
       SET status = 'success', updated_at = NOW()
       WHERE id = $1`,
      [paymentId]
    );
    
    console.log('[PAYMENT] ✓ Payment marked successful');
  } catch (error) {
    console.error('[PAYMENT] ✗ Error marking payment successful:', error.message);
    throw error;
  }
}

/**
 * Mark a payment as permanently failed (max retries exceeded)
 */
export async function markPaymentPermanentlyFailed(paymentId, errorMessage) {
  try {
    console.log('[PAYMENT] Marking payment as permanently failed:', paymentId);
    
    await pool.query(
      `UPDATE payment_attempts 
       SET status = 'permanently_failed', error_message = $2, updated_at = NOW()
       WHERE id = $1`,
      [paymentId, errorMessage]
    );
    
    console.log('[PAYMENT] ✓ Payment marked permanently failed');
  } catch (error) {
    console.error('[PAYMENT] ✗ Error marking payment permanently failed:', error.message);
    throw error;
  }
}

/**
 * Schedule next retry with exponential backoff
 * Retry 1: 1 hour
 * Retry 2: 24 hours
 * Retry 3: 7 days
 */
export function getNextRetryTime(retryCount) {
  const intervals = [
    1 * 60 * 60 * 1000,      // 1 hour (retry 0)
    24 * 60 * 60 * 1000,     // 24 hours (retry 1)
    7 * 24 * 60 * 60 * 1000, // 7 days (retry 2)
  ];
  
  const msInterval = intervals[retryCount] || intervals[intervals.length - 1];
  return new Date(Date.now() + msInterval);
}

/**
 * Update retry schedule for a payment
 */
export async function scheduleNextRetry(paymentId, retryCount) {
  try {
    const nextRetryTime = getNextRetryTime(retryCount);
    
    console.log('[PAYMENT] Scheduling next retry:', {
      paymentId,
      retryCount,
      nextRetryTime,
    });
    
    await pool.query(
      `UPDATE payment_attempts 
       SET next_retry_at = $2, updated_at = NOW()
       WHERE id = $1`,
      [paymentId, nextRetryTime]
    );
    
    return nextRetryTime;
  } catch (error) {
    console.error('[PAYMENT] ✗ Error scheduling next retry:', error.message);
    throw error;
  }
}

/**
 * Get payment failure stats for monitoring
 */
export async function getPaymentStats() {
  try {
    const result = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM payment_attempts
      GROUP BY status
      ORDER BY count DESC
    `);
    
    return {
      total: result.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
      byStatus: result.rows,
    };
  } catch (error) {
    console.error('[PAYMENT] ✗ Error getting payment stats:', error.message);
    throw error;
  }
}

/**
 * Get failed payments needing support intervention
 */
export async function getFailedPaymentsNeedingSupport() {
  try {
    const result = await pool.query(`
      SELECT id, user_id, paddle_transaction_id, amount, currency, error_code, retry_count, created_at
      FROM payment_attempts
      WHERE status = 'permanently_failed' OR (status = 'failed' AND retry_count >= max_retries - 1)
      ORDER BY created_at DESC
      LIMIT 50
    `);
    
    return result.rows;
  } catch (error) {
    console.error('[PAYMENT] ✗ Error getting failed payments:', error.message);
    throw error;
  }
}
