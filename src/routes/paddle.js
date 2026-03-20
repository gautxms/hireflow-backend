import express from 'express';
import pool from '../config/db.js';
import { verifyToken } from '../middleware/auth.js';
import { logPaymentFailure } from '../services/paymentRetry.js';

const router = express.Router();

const PADDLE_API_BASE_URL = process.env.PADDLE_API_BASE_URL || 'https://api.paddle.com';
const PADDLE_API_VERSION = process.env.PADDLE_API_VERSION || '1';

const PRICE_IDS_BY_PLAN = {
  monthly: process.env.PADDLE_MONTHLY_PRICE_ID,
  annual: process.env.PADDLE_ANNUAL_PRICE_ID,
};

function getAppOrigin(req) {
  return process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
}

// POST /api/paddle/checkout-url - Create a Paddle checkout session
router.post('/checkout-url', verifyToken, async (req, res) => {
  const { plan } = req.body || {};
  const userId = req.user?.userId;

  console.log('[PADDLE] Checkout request:', {
    plan,
    userId,
    timestamp: new Date().toISOString(),
    apiKeyExists: !!process.env.PADDLE_API_KEY,
  });

  // Validate plan
  if (plan !== 'monthly' && plan !== 'annual') {
    console.error('[PADDLE] ✗ Invalid plan:', plan);
    return res.status(400).json({ error: 'Plan must be monthly or annual' });
  }

  // Check API key
  if (!process.env.PADDLE_API_KEY) {
    console.error('[PADDLE] ✗ PADDLE_API_KEY not configured');
    return res.status(500).json({ error: 'Paddle API key is not configured' });
  }

  // Get price ID
  const priceId = PRICE_IDS_BY_PLAN[plan];
  if (!priceId) {
    console.error('[PADDLE] ✗ Missing price ID for plan:', plan);
    return res.status(500).json({ error: `Paddle price ID is missing for ${plan} plan` });
  }

  try {
    // Get user from database
    const result = await pool.query(
      'SELECT id, email FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      console.error('[PADDLE] ✗ User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const appOrigin = getAppOrigin(req);
    const successUrl = `${appOrigin}/billing/success`;
    const cancelUrl = `${appOrigin}/billing/cancel`;

    console.log('[PADDLE] Creating transaction:', {
      priceId,
      userEmail: user.email,
      successUrl,
      cancelUrl,
    });

    // Call Paddle API to create checkout
    const paddleResponse = await fetch(`${PADDLE_API_BASE_URL}/transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`,
        'Content-Type': 'application/json',
        'Paddle-Version': PADDLE_API_VERSION,
      },
      body: JSON.stringify({
        items: [{
          price_id: priceId,
          quantity: 1,
        }],
        customer: {
          email: user.email,
        },
        custom_data: {
          userId: user.id,
          email: user.email,
          plan,
        },
        checkout: {
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
      }),
    });

    const paddlePayload = await paddleResponse.json();

    if (!paddleResponse.ok) {
      console.error('[PADDLE] ✗ Paddle API error:', {
        status: paddleResponse.status,
        error: paddlePayload,
      });
      return res.status(502).json({ error: 'Failed to create Paddle checkout', details: paddlePayload });
    }

    const checkoutUrl = paddlePayload?.data?.checkout?.url;

    if (!checkoutUrl) {
      console.error('[PADDLE] ✗ No checkout URL in Paddle response:', paddlePayload);
      return res.status(502).json({ error: 'Paddle checkout URL missing in response' });
    }

    console.log('[PADDLE] ✓ Checkout URL created successfully');
    res.json({ checkoutUrl });
  } catch (error) {
    console.error('[PADDLE] ✗ Error creating checkout:', error.message);
    console.error('[PADDLE] ✗ Stack:', error.stack);
    res.status(500).json({ error: 'Failed to create checkout', message: error.message });
  }
});

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

      case 'transaction.failed':
        await handleTransactionFailed(eventData);
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

/**
 * Handle transaction.failed event
 * Logs payment failure for automatic retry with exponential backoff
 */
async function handleTransactionFailed(eventData) {
  try {
    console.log('[PADDLE] Processing transaction.failed');
    
    const transactionId = eventData?.id;
    const customerId = eventData?.customer?.id;
    const customerEmail = eventData?.customer?.email;
    const errorCode = eventData?.error?.code || 'UNKNOWN_ERROR';
    const errorMessage = eventData?.error?.message || 'Payment failed';
    const amount = eventData?.details?.totals?.grand_total;
    const currency = eventData?.details?.currency;

    if (!customerEmail || !transactionId) {
      console.error('[PADDLE] ✗ Missing email or transaction ID in failed event');
      return;
    }

    console.log('[PADDLE] Payment failed:', {
      transactionId,
      email: customerEmail,
      errorCode,
      errorMessage,
    });

    // Find user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [customerEmail.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      console.error('[PADDLE] ✗ User not found for email:', customerEmail);
      return;
    }

    const userId = userResult.rows[0].id;

    // Log payment failure for later retry
    const paymentAttemptId = await logPaymentFailure(
      userId,
      transactionId,
      customerId,
      errorCode,
      errorMessage,
      amount,
      currency
    );

    console.log('[PADDLE] ✓ Payment failure logged for retry:', paymentAttemptId);

    // Send admin notification
    console.log('[PADDLE] Admin notification: Payment failed for user', userId);
    // TODO: Send Slack/email alert to support team

  } catch (error) {
    console.error('[PADDLE] ✗ Error in handleTransactionFailed:', error.message);
  }
}

// GET /api/paddle/health (for testing)
router.get('/health', (req, res) => {
  res.json({ status: 'paddle-webhook-ready' });
});

export default router;
