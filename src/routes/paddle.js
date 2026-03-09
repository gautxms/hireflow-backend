import express from 'express';

const router = express.Router();

// POST /api/paddle/webhook
router.post('/webhook', (req, res) => {
  console.log('[PADDLE] Webhook received');
  console.log('[PADDLE] Event type:', req.body?.event_type);
  console.log('[PADDLE] Data:', JSON.stringify(req.body?.data || {}, null, 2));

  try {
    const eventType = req.body?.event_type;

    // Handle different Paddle events
    switch (eventType) {
      case 'subscription.created':
        console.log('[PADDLE] ✓ New subscription created');
        // TODO: Update user subscription status in database
        break;

      case 'subscription.updated':
        console.log('[PADDLE] ✓ Subscription updated');
        // TODO: Update subscription details
        break;

      case 'subscription.paused':
        console.log('[PADDLE] ✓ Subscription paused');
        // TODO: Disable user access
        break;

      case 'subscription.resumed':
        console.log('[PADDLE] ✓ Subscription resumed');
        // TODO: Re-enable user access
        break;

      case 'subscription.cancelled':
        console.log('[PADDLE] ✓ Subscription cancelled');
        // TODO: Mark subscription as inactive
        break;

      case 'transaction.completed':
        console.log('[PADDLE] ✓ Payment completed');
        // TODO: Record payment, update trial status
        break;

      default:
        console.log('[PADDLE] ⚠ Unknown event type:', eventType);
    }

    // Return 200 OK immediately (Paddle expects 2xx response)
    res.status(200).json({ success: true, event: eventType });
  } catch (error) {
    console.error('[PADDLE] ✗ Error processing webhook:', error.message);
    // Still return 200 to prevent Paddle retries
    res.status(200).json({ success: false, error: error.message });
  }
});

// GET /api/paddle/health (for testing)
router.get('/health', (req, res) => {
  res.json({ status: 'paddle-webhook-ready' });
});

export default router;
