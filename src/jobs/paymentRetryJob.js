/**
 * Payment Retry Job
 * Runs periodically (every hour) to retry failed payments
 * Uses exponential backoff: 1h, 24h, 7d
 */

import pool from '../config/db.js';
import {
  getPaymentsDueForRetry,
  markPaymentRetryAttempted,
  markPaymentSuccess,
  scheduleNextRetry,
  markPaymentPermanentlyFailed,
  getPaymentStats,
  getFailedPaymentsNeedingSupport,
} from '../services/paymentRetry.js';

/**
 * Main payment retry job
 */
export async function paymentRetryJob() {
  const startTime = Date.now();
  console.log('[JOB-PAYMENTS] ================================');
  console.log('[JOB-PAYMENTS] Starting payment retry job...');
  console.log('[JOB-PAYMENTS] Time:', new Date().toISOString());
  
  try {
    // Get statistics
    const stats = await getPaymentStats();
    console.log('[JOB-PAYMENTS] Payment statistics:', stats);

    // Find payments due for retry
    const paymentsDue = await getPaymentsDueForRetry(10);
    console.log('[JOB-PAYMENTS] Found', paymentsDue.length, 'payments due for retry');

    if (paymentsDue.length === 0) {
      console.log('[JOB-PAYMENTS] ✓ No payments to retry');
      logJobCompletion('success', 0, 0, startTime);
      return;
    }

    // Process each payment
    let successCount = 0;
    let failCount = 0;

    for (const payment of paymentsDue) {
      try {
        await retryPayment(payment);
        successCount++;
      } catch (error) {
        console.error('[JOB-PAYMENTS] ✗ Error retrying payment:', payment.id, error.message);
        failCount++;
      }
    }

    // Check for payments needing support intervention
    const needingSupport = await getFailedPaymentsNeedingSupport();
    if (needingSupport.length > 0) {
      console.log('[JOB-PAYMENTS] ⚠ Payments needing support:', needingSupport.length);
      await alertSupport(needingSupport);
    }

    logJobCompletion('success', successCount, failCount, startTime);

  } catch (error) {
    console.error('[JOB-PAYMENTS] ✗ CRITICAL ERROR:', error.message);
    console.error('[JOB-PAYMENTS] Stack:', error.stack);
    logJobCompletion('failure', 0, 0, startTime, error.message);
  }
}

/**
 * Retry a single payment
 */
async function retryPayment(payment) {
  const { id: paymentId, user_id, paddle_transaction_id, amount, retry_count } = payment;

  console.log('[RETRY] ================================');
  console.log('[RETRY] Attempting payment retry:', {
    paymentId,
    transactionId: paddle_transaction_id,
    retryCount: retry_count,
    amount,
  });

  try {
    // Mark attempt
    await markPaymentRetryAttempted(paymentId);

    // Call Paddle API to retry transaction
    const response = await retryPaddleTransaction(paddle_transaction_id);

    if (response.success) {
      console.log('[RETRY] ✓ Payment successful!');
      await markPaymentSuccess(paymentId);
      
      // Mark user subscription as active (if not already)
      await markSubscriptionActive(user_id);
      
      return;
    }

    // Still failing - schedule next retry
    console.log('[RETRY] ✗ Payment still failing. Error:', response.error);
    const nextRetryTime = await scheduleNextRetry(paymentId, retry_count);

    // If this is the last retry, mark as permanently failed
    if (retry_count >= 2) {
      console.log('[RETRY] ✗ Max retries reached. Marking as permanently failed.');
      await markPaymentPermanentlyFailed(paymentId, response.error);
    }

    console.log('[RETRY] Next retry scheduled for:', nextRetryTime);

  } catch (error) {
    console.error('[RETRY] ✗ Error during retry:', error.message);
    throw error;
  }
}

/**
 * Call Paddle API to retry transaction
 * In a real implementation, this would call Paddle's retry endpoint
 * For now, we'll simulate the retry behavior
 */
async function retryPaddleTransaction(transactionId) {
  try {
    console.log('[PADDLE] Attempting to retry transaction:', transactionId);

    // In production, call Paddle API:
    // const response = await fetch(`https://api.paddle.com/transactions/${transactionId}/retry`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`,
    //     'Content-Type': 'application/json',
    //   },
    // });

    // For MVP, simulate retry (would be real API call)
    // This is where you'd integrate with Paddle's actual retry endpoint
    
    console.log('[PADDLE] Retry initiated');
    
    // Return success (in production, parse actual response)
    return {
      success: true,
      status: 'completed',
    };

  } catch (error) {
    console.error('[PADDLE] ✗ Error retrying transaction:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Mark user subscription as active after successful payment
 */
async function markSubscriptionActive(userId) {
  try {
    console.log('[JOB-PAYMENTS] Marking subscription active for user:', userId);
    
    await pool.query(
      `UPDATE users 
       SET subscription_status = 'active', updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );
    
    console.log('[JOB-PAYMENTS] ✓ Subscription marked active');
  } catch (error) {
    console.error('[JOB-PAYMENTS] ✗ Error marking subscription active:', error.message);
  }
}

/**
 * Alert support about payments needing intervention
 */
async function alertSupport(failedPayments) {
  try {
    console.log('[JOB-PAYMENTS] Sending support alert for', failedPayments.length, 'payments');
    
    // In production, send email/Slack notification
    const summary = failedPayments.map(p => 
      `Transaction ${p.paddle_transaction_id}: $${p.amount} ${p.currency} (${p.error_code})`
    ).join('\n');

    console.log('[JOB-PAYMENTS] Failed payments needing support:');
    console.log(summary);

    // TODO: Send to Slack/email
    // await sendSlackAlert({
    //   channel: '#payments',
    //   text: `Payment retry job: ${failedPayments.length} payments need support intervention`,
    //   attachments: failedPayments,
    // });

  } catch (error) {
    console.error('[JOB-PAYMENTS] ✗ Error sending support alert:', error.message);
  }
}

/**
 * Log job completion
 */
function logJobCompletion(status, successCount, failCount, startTime, errorMessage = '') {
  const duration = Date.now() - startTime;
  console.log('[JOB-PAYMENTS] ================================');
  console.log('[JOB-PAYMENTS] Job Status:', status.toUpperCase());
  console.log('[JOB-PAYMENTS] Successful retries:', successCount);
  console.log('[JOB-PAYMENTS] Failed retries:', failCount);
  console.log('[JOB-PAYMENTS] Duration:', `${duration}ms`);
  if (errorMessage) {
    console.log('[JOB-PAYMENTS] Error:', errorMessage);
  }
  console.log('[JOB-PAYMENTS] ================================');
}

/**
 * Health check - verify payment system is operational
 */
export async function paymentHealthCheck() {
  try {
    const stats = await getPaymentStats();
    const failedPayments = await getFailedPaymentsNeedingSupport();

    return {
      healthy: failedPayments.length === 0,
      stats,
      needsAttention: failedPayments.length > 0,
      failedPaymentsCount: failedPayments.length,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
    };
  }
}
