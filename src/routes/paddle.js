import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// POST /api/paddle/webhook
router.post('/webhook', async (req, res) => {
  console.log('[PADDLE] Webhook received');
  console.log('[PADDLE] Event type:', req.body?.event_type);

  try {
    const eventType = req.body?.event_type;
    const eventData = req.body?.data || {};

    // Handle different Paddle events
    switch (eventType) {
      case 'subscription.created':
        await handleSubscriptionCreated(eventData);
        break;

      case 'subscription.updated':
        await handleSubscriptionUpdated(eventData);
        break;

      case 'subscription.paused':
        await handleSubscriptionPaused(eventData);
        break;

      case 'subscription.resumed':
        await handleSubscriptionResumed(eventData);
        break;

      case 'subscription.cancelled':
        await handleSubscriptionCancelled(eventData);
        break;

      case 'transaction.completed':
        await handleTransactionCompleted(eventData);
        break;

      default:
        console.log('[PADDLE] ⚠ Unknown event type:', eventType);
    }

    // Return 200 OK immediately (Paddle expects 2xx response)
    res.status(200).json({ success: true, event: eventType });
  } catch (error) {
    console.error('[PADDLE] ✗ Error processing webhook:', error.message);
    console.error('[PADDLE] ✗ Stack:', error.stack);
    // Still return 200 to prevent Paddle retries
    res.status(200).json({ success: false, error: error.message });
  }
});

/**
 * Handle subscription.created event
 * Updates paddle_customer_id and paddle_subscription_id
 */
async function handleSubscriptionCreated(eventData) {
  try {
    console.log('[PADDLE] Processing subscription.created');
    
    const customerId = eventData?.customer?.id;
    const subscriptionId = eventData?.id;
    const customerEmail = eventData?.customer?.email;

    if (!customerEmail || !subscriptionId) {
      console.error('[PADDLE] ✗ Missing email or subscription ID in event data');
      return;
    }

    console.log('[PADDLE] Updating user:', customerEmail);
    
    const result = await pool.query(
      `UPDATE users 
       SET paddle_customer_id = $1, 
           paddle_subscription_id = $2,
           subscription_status = 'active',
           updated_at = CURRENT_TIMESTAMP
       WHERE email = $3
       RETURNING id, email, subscription_status`,
      [customerId, subscriptionId, customerEmail.toLowerCase()]
    );

    if (result.rows.length > 0) {
      console.log('[PADDLE] ✓ User updated:', result.rows[0]);
    } else {
      console.error('[PADDLE] ✗ User not found:', customerEmail);
    }
  } catch (error) {
    console.error('[PADDLE] ✗ Error in handleSubscriptionCreated:', error.message);
  }
}

/**
 * Handle subscription.updated event
 */
async function handleSubscriptionUpdated(eventData) {
  try {
    console.log('[PADDLE] Processing subscription.updated');
    
    const subscriptionId = eventData?.id;
    const customerEmail = eventData?.customer?.email;

    if (!customerEmail || !subscriptionId) {
      console.error('[PADDLE] ✗ Missing email or subscription ID');
      return;
    }

    await pool.query(
      `UPDATE users 
       SET paddle_subscription_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE email = $2`,
      [subscriptionId, customerEmail.toLowerCase()]
    );

    console.log('[PADDLE] ✓ Subscription updated for:', customerEmail);
  } catch (error) {
    console.error('[PADDLE] ✗ Error in handleSubscriptionUpdated:', error.message);
  }
}

/**
 * Handle subscription.paused event
 * Sets subscription_status = 'paused'
 */
async function handleSubscriptionPaused(eventData) {
  try {
    console.log('[PADDLE] Processing subscription.paused');
    
    const subscriptionId = eventData?.id;
    const customerEmail = eventData?.customer?.email;

    if (!customerEmail) {
      console.error('[PADDLE] ✗ Missing email');
      return;
    }

    await pool.query(
      `UPDATE users 
       SET subscription_status = 'paused',
           updated_at = CURRENT_TIMESTAMP
       WHERE email = $1`,
      [customerEmail.toLowerCase()]
    );

    console.log('[PADDLE] ✓ Subscription paused for:', customerEmail);
  } catch (error) {
    console.error('[PADDLE] ✗ Error in handleSubscriptionPaused:', error.message);
  }
}

/**
 * Handle subscription.resumed event
 * Sets subscription_status = 'active'
 */
async function handleSubscriptionResumed(eventData) {
  try {
    console.log('[PADDLE] Processing subscription.resumed');
    
    const customerEmail = eventData?.customer?.email;

    if (!customerEmail) {
      console.error('[PADDLE] ✗ Missing email');
      return;
    }

    await pool.query(
      `UPDATE users 
       SET subscription_status = 'active',
           updated_at = CURRENT_TIMESTAMP
       WHERE email = $1`,
      [customerEmail.toLowerCase()]
    );

    console.log('[PADDLE] ✓ Subscription resumed for:', customerEmail);
  } catch (error) {
    console.error('[PADDLE] ✗ Error in handleSubscriptionResumed:', error.message);
  }
}

/**
 * Handle subscription.cancelled event
 * Sets subscription_status = 'cancelled'
 */
async function handleSubscriptionCancelled(eventData) {
  try {
    console.log('[PADDLE] Processing subscription.cancelled');
    
    const customerEmail = eventData?.customer?.email;

    if (!customerEmail) {
      console.error('[PADDLE] ✗ Missing email');
      return;
    }

    await pool.query(
      `UPDATE users 
       SET subscription_status = 'cancelled',
           updated_at = CURRENT_TIMESTAMP
       WHERE email = $1`,
      [customerEmail.toLowerCase()]
    );

    console.log('[PADDLE] ✓ Subscription cancelled for:', customerEmail);
  } catch (error) {
    console.error('[PADDLE] ✗ Error in handleSubscriptionCancelled:', error.message);
  }
}

/**
 * Handle transaction.completed event
 * Sets subscription_status = 'active' and records payment
 */
async function handleTransactionCompleted(eventData) {
  try {
    console.log('[PADDLE] Processing transaction.completed');
    
    const customerEmail = eventData?.customer?.email;
    const transactionId = eventData?.id;
    const status = eventData?.status;

    if (!customerEmail) {
      console.error('[PADDLE] ✗ Missing email in transaction event');
      return;
    }

    if (status !== 'completed') {
      console.log('[PADDLE] ⚠ Transaction status not completed:', status);
      return;
    }

    console.log('[PADDLE] Updating user subscription_status to active:', customerEmail);
    
    const result = await pool.query(
      `UPDATE users 
       SET subscription_status = 'active',
           updated_at = CURRENT_TIMESTAMP
       WHERE email = $1
       RETURNING id, email, subscription_status`,
      [customerEmail.toLowerCase()]
    );

    if (result.rows.length > 0) {
      console.log('[PADDLE] ✓ User subscription activated! Transaction:', transactionId);
      console.log('[PADDLE] ✓ User details:', result.rows[0]);
    } else {
      console.error('[PADDLE] ✗ User not found for email:', customerEmail);
    }
  } catch (error) {
    console.error('[PADDLE] ✗ Error in handleTransactionCompleted:', error.message);
  }
}

// GET /api/paddle/health (for testing)
router.get('/health', (req, res) => {
  res.json({ status: 'paddle-webhook-ready' });
});

export default router;
