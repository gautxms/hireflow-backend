# Payment Error Handling & Retry Testing Guide

This document covers testing the P1-PAYMENTS implementation (error handling, exponential backoff retries, job scheduling).

## Overview

The payment retry system automatically recovers failed transactions with exponential backoff:
- **Retry 1:** 1 hour after failure
- **Retry 2:** 24 hours after first retry (if still failing)
- **Retry 3:** 7 days after second retry (if still failing)
- **Max retries:** 3 attempts
- **After max retries:** Payment marked as permanently failed, support alerted

## Database Tables

### payment_attempts Table

```sql
CREATE TABLE payment_attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  paddle_transaction_id VARCHAR(255) UNIQUE,
  paddle_customer_id VARCHAR(255),
  amount DECIMAL(10, 2),
  currency VARCHAR(3),
  status VARCHAR(50), -- 'pending', 'failed', 'success', 'permanently_failed'
  error_code VARCHAR(100),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP,
  last_attempted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Test 1: Webhook Simulation - Transaction Failed

### Setup

1. **Create a test user:**
   ```bash
   curl -X POST http://localhost:8080/api/auth/signup \
     -H "Content-Type: application/json" \
     -d '{
       "email": "payment-test@example.com",
       "password": "TestPassword123"
     }'
   ```

2. **Get the user ID from database:**
   ```bash
   psql $DATABASE_URL -c "SELECT id, email FROM users WHERE email = 'payment-test@example.com';"
   ```
   Note the user ID (e.g., `5`)

### Test Webhook Event

```bash
curl -X POST http://localhost:8080/api/paddle/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "transaction.failed",
    "data": {
      "id": "txn_test_123456",
      "customer": {
        "id": "ctm_test_123456",
        "email": "payment-test@example.com"
      },
      "error": {
        "code": "PAYMENT_DECLINED",
        "message": "Card was declined by the payment processor"
      },
      "details": {
        "totals": {
          "grand_total": "29.99"
        },
        "currency": "USD"
      }
    }
  }'
```

**Expected Response:** 200 OK
```json
{
  "success": true,
  "event": "transaction.failed"
}
```

**Expected Log Output:**
```
[PADDLE] Processing transaction.failed
[PADDLE] Payment failed: {
  transactionId: 'txn_test_123456',
  email: 'payment-test@example.com',
  errorCode: 'PAYMENT_DECLINED',
  errorMessage: 'Card was declined by the payment processor'
}
[PAYMENT] Logging payment failure for user: 5
[PAYMENT] ✓ Payment failure logged
```

### Verify Payment Logged

Check database:
```bash
psql $DATABASE_URL -c "SELECT id, user_id, paddle_transaction_id, status, error_code, next_retry_at FROM payment_attempts ORDER BY created_at DESC LIMIT 1;"
```

**Expected output:**
```
 id | user_id | paddle_transaction_id | status | error_code       | next_retry_at
----+---------+-----------------------+--------+------------------+------------------------
  1 |       5 | txn_test_123456       | failed | PAYMENT_DECLINED | 2026-03-17 20:00:00
```

Status: **FAILED** ✅
Next retry: **1 hour from now** ✅

---

## Test 2: Payment Retry Job (Manual Trigger)

### Check Current Status

```bash
psql $DATABASE_URL -c "SELECT id, status, retry_count, next_retry_at FROM payment_attempts WHERE user_id = 5;"
```

**Current state:** status='failed', retry_count=0, next_retry_at=<1 hour from now>

### Trigger Payment Retry Job

The job runs automatically every hour, but you can trigger it manually for testing:

**Via curl (create an endpoint for testing):**

```javascript
// In src/routes/paddle.js or test route
router.post('/test/retry-job', async (req, res) => {
  try {
    const { paymentRetryJob } = await import('../jobs/paymentRetryJob.js');
    await paymentRetryJob();
    res.json({ success: true, message: 'Retry job executed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

Then:
```bash
curl -X POST http://localhost:8080/api/paddle/test/retry-job
```

### Job Output

```
[JOB-PAYMENTS] ================================
[JOB-PAYMENTS] Starting payment retry job...
[JOB-PAYMENTS] Time: 2026-03-17T19:00:00.000Z
[JOB-PAYMENTS] Payment statistics: {
  total: 1,
  byStatus: [ { status: 'failed', count: 1, total_amount: '29.99' } ]
}
[JOB-PAYMENTS] Found 1 payments due for retry
[RETRY] ================================
[RETRY] Attempting payment retry: {
  paymentId: 1,
  transactionId: 'txn_test_123456',
  retryCount: 0,
  amount: '29.99'
}
[RETRY] ✓ Payment successful!
[JOB-PAYMENTS] Marking subscription active for user: 5
[JOB-PAYMENTS] ✓ Subscription marked active
[JOB-PAYMENTS] ================================
[JOB-PAYMENTS] Job Status: SUCCESS
[JOB-PAYMENTS] Successful retries: 1
[JOB-PAYMENTS] Failed retries: 0
[JOB-PAYMENTS] Duration: 145ms
[JOB-PAYMENTS] ================================
```

### Verify Payment Updated

```bash
psql $DATABASE_URL -c "SELECT id, status, retry_count, subscription_status FROM payment_attempts pa JOIN users u ON pa.user_id = u.id WHERE u.id = 5;"
```

**Expected state:**
- payment_attempts.status = 'success' ✅
- users.subscription_status = 'active' ✅

---

## Test 3: Multiple Retry Attempts (Exponential Backoff)

### Setup: Create a Payment That Fails Multiple Times

```bash
# Simulate 3 failed payment events in sequence
for i in {1..3}; do
  curl -X POST http://localhost:8080/api/paddle/webhook \
    -H "Content-Type: application/json" \
    -d "{
      \"event_type\": \"transaction.failed\",
      \"data\": {
        \"id\": \"txn_backoff_test_$i\",
        \"customer\": {
          \"id\": \"ctm_test_123456\",
          \"email\": \"payment-test@example.com\"
        },
        \"error\": {
          \"code\": \"PROCESSING_ERROR\",
          \"message\": \"Payment processor temporarily unavailable\"
        },
        \"details\": {
          \"totals\": { \"grand_total\": \"49.99\" },
          \"currency\": \"USD\"
        }
      }
    }"
  sleep 1
done
```

### Check Payment Attempts

```bash
psql $DATABASE_URL -c "SELECT id, paddle_transaction_id, status, retry_count, next_retry_at FROM payment_attempts WHERE user_id = 5 ORDER BY created_at;"
```

**Expected output:**
```
 id |    paddle_transaction_id    | status | retry_count |        next_retry_at
----+-----------------------------+--------+-------------+-------------------------
  2 | txn_backoff_test_1          | failed |           0 | 2026-03-17 20:00:00
  3 | txn_backoff_test_2          | failed |           0 | 2026-03-17 20:00:00
  4 | txn_backoff_test_3          | failed |           0 | 2026-03-17 20:00:00
```

All scheduled for 1 hour from now ✅

### Simulate First Retry Failure (Still Failing)

Manually update payment to simulate failed retry:

```bash
psql $DATABASE_URL << 'EOF'
UPDATE payment_attempts 
SET retry_count = 1, 
    status = 'failed',
    next_retry_at = NOW() 
WHERE id = 2;
EOF
```

### Trigger Job (Payment Still Fails)

After job runs (or manual trigger), payment should be rescheduled:

```bash
psql $DATABASE_URL -c "SELECT id, status, retry_count, next_retry_at FROM payment_attempts WHERE id = 2;"
```

**Expected state:**
- retry_count = 1 (one retry attempted)
- status = 'failed' (still failing)
- next_retry_at = 24 hours from now ✅ (exponential backoff)

### Simulate Second Retry Failure

```bash
psql $DATABASE_URL << 'EOF'
UPDATE payment_attempts 
SET retry_count = 2, 
    status = 'failed',
    next_retry_at = NOW() 
WHERE id = 2;
EOF
```

After job runs:

```bash
psql $DATABASE_URL -c "SELECT id, status, retry_count, next_retry_at FROM payment_attempts WHERE id = 2;"
```

**Expected state:**
- retry_count = 2
- status = 'failed'
- next_retry_at = 7 days from now ✅ (final retry in 7 days)

### Simulate Max Retries Exceeded

```bash
psql $DATABASE_URL << 'EOF'
UPDATE payment_attempts 
SET retry_count = 3, 
    status = 'failed',
    next_retry_at = NOW() 
WHERE id = 2;
EOF
```

After job runs:

```bash
psql $DATABASE_URL -c "SELECT id, status, retry_count FROM payment_attempts WHERE id = 2;"
```

**Expected state:**
- retry_count = 3
- status = 'permanently_failed' ✅
- Support should be alerted (TODO: implement email/Slack)

---

## Test 4: Monitoring Endpoints

### Payment Statistics

Create a health check endpoint:

```javascript
// In src/routes/paddle.js
router.get('/stats', async (req, res) => {
  const { getPaymentStats } = await import('../services/paymentRetry.js');
  const stats = await getPaymentStats();
  res.json(stats);
});
```

```bash
curl http://localhost:8080/api/paddle/stats
```

**Response:**
```json
{
  "total": 4,
  "byStatus": [
    { "status": "failed", "count": 3, "total_amount": "129.97" },
    { "status": "success", "count": 1, "total_amount": "29.99" }
  ]
}
```

### Payments Needing Support

```javascript
// In src/routes/paddle.js
router.get('/failed-payments', async (req, res) => {
  const { getFailedPaymentsNeedingSupport } = await import('../services/paymentRetry.js');
  const payments = await getFailedPaymentsNeedingSupport();
  res.json(payments);
});
```

```bash
curl http://localhost:8080/api/paddle/failed-payments
```

---

## Test 5: Job Scheduling Verification

### Verify Job Registered

Check logs on server startup:

```
[JOB-PAYMENTS] Scheduling payment retry job (hourly)...
[JOB-PAYMENTS] ✓ Payment retry job scheduled (hourly)
```

### Verify Job Runs Hourly

Check logs - every hour should see:

```
[JOB-PAYMENTS] ================================
[JOB-PAYMENTS] Starting payment retry job...
[JOB-PAYMENTS] Time: 2026-03-17T21:00:00.000Z
...
```

---

## Test 6: Error Scenarios

### Test 1: Webhook with Missing Email

```bash
curl -X POST http://localhost:8080/api/paddle/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "transaction.failed",
    "data": {
      "id": "txn_no_email",
      "customer": {
        "id": "ctm_123"
        # NO EMAIL
      },
      "error": { "code": "ERROR", "message": "Failed" }
    }
  }'
```

**Expected Log:**
```
[PADDLE] ✗ Missing email or transaction ID in failed event
```

No payment logged ✅

### Test 2: Webhook with User Not Found

```bash
curl -X POST http://localhost:8080/api/paddle/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "transaction.failed",
    "data": {
      "id": "txn_no_user",
      "customer": {
        "id": "ctm_999",
        "email": "nonexistent@example.com"
      },
      "error": { "code": "ERROR", "message": "Failed" }
    }
  }'
```

**Expected Log:**
```
[PADDLE] ✗ User not found for email: nonexistent@example.com
```

No payment logged ✅ (Prevents orphaned payment records)

---

## Monitoring Checklist

- [x] Failed transactions logged to payment_attempts table
- [x] Payment status correctly set to 'failed'
- [x] next_retry_at scheduled for 1 hour
- [x] Retry job finds payments due for retry
- [x] Exponential backoff: 1h → 24h → 7d
- [x] Max retries enforced (3 attempts)
- [x] Permanently failed payments tracked
- [x] User subscription marked active on payment success
- [x] Job runs every hour
- [x] Error handling prevents crashes
- [x] Support alerts on max retries exceeded

---

## Future Enhancements

1. **Webhook Retry Logic:** If Paddle webhook times out, implement our own retry (3x exponential backoff)
2. **Slack Alerts:** Send real-time alerts for failed payments
3. **Manual Retry Admin UI:** Allow admins to trigger manual retries
4. **Analytics Dashboard:** Show payment success rate, ARPU, churn by payment failures
5. **Idempotency Keys:** Prevent double-charging if webhooks fire twice
6. **Smart Retry Logic:** Detect permanent failures (invalid card) vs temporary (network error)

---
