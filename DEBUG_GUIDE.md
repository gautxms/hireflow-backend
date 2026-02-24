# Database Connection Debug Guide
**Status:** Enhanced logging added for getaddrinfo ENOTFOUND diagnosis  
**Date:** 2026-02-23  
**Purpose:** Identify why signup fails while health check works

---

## 🔍 What Was Added

### **1. Database Configuration Logging (`src/config/db.js`)**

When the server starts, you'll now see:
```
[DB] Initializing pool...
[DB] NODE_ENV: production
[DB] DATABASE_URL present: true
[DB] Connection string: postgresql://***@shared-oregon.railway.app:5432/railway
[DB] Is Railway: YES
[DB] Pool created successfully
```

**What this tells you:**
- ✅ DATABASE_URL is loaded from environment
- ✅ Connection string is correctly formatted
- ✅ Pool initialized without errors

**If you see:**
```
[DB] DATABASE_URL present: false
```
→ **CRITICAL:** DATABASE_URL is not set in Railway environment variables

---

### **2. Signup Request Logging (`src/routes/auth.js`)**

When signup is called:
```
[SIGNUP] Request received for email: user@example.com
[SIGNUP] Pool has connectionString: true
[SIGNUP] Attempting database query...
[SIGNUP] Success! User created: user@example.com
```

**If you see error:**
```
[SIGNUP] ERROR: getaddrinfo ENOTFOUND host
[SIGNUP] Error code: ENOTFOUND
```

→ **This means:** Pool is trying to resolve a hostname that doesn't exist
→ **Likely cause:** DATABASE_URL is malformed or not being used

---

### **3. Login Request Logging (`src/routes/auth.js`)**

Similar pattern:
```
[LOGIN] Request received for email: user@example.com
[LOGIN] Querying database for user...
[LOGIN] Success! User authenticated: user@example.com
```

---

### **4. Server Startup Diagnostics (`src/server.js`)**

Server now logs database readiness:
```
✓ Server running on 0.0.0.0:3000
✓ Frontend: https://hireflow.dev
✓ NODE_ENV: production
✓ DATABASE_URL: postgresql://***@shared-oregon.railway.app:5432/railway
✓ Is Railway DB: YES
✓ JWT_SECRET: ✓ Set
[SERVER] Ready for connections
```

---

## 📋 Complete Expected Log Sequence

**Healthy startup:**
```
[DB] Initializing pool...
[DB] NODE_ENV: production
[DB] DATABASE_URL present: true
[DB] Connection string: postgresql://***@shared-oregon.railway.app:5432/railway
[DB] Is Railway: YES
[DB] Pool created successfully
Initializing database...
✓ Database schema created/verified
✓ Server running on 0.0.0.0:3000
✓ Frontend: https://hireflow.dev
✓ NODE_ENV: production
✓ DATABASE_URL: postgresql://***@shared-oregon.railway.app:5432/railway
✓ Is Railway DB: YES
✓ JWT_SECRET: ✓ Set
[SERVER] Ready for connections
```

**Signup request (success):**
```
[SIGNUP] Request received for email: test@example.com
[SIGNUP] Pool has connectionString: true
[SIGNUP] Attempting database query...
[SIGNUP] Success! User created: test@example.com
```

**Signup request (failure - ENOTFOUND):**
```
[SIGNUP] Request received for email: test@example.com
[SIGNUP] Pool has connectionString: true
[SIGNUP] Attempting database query...
[SIGNUP] ERROR: getaddrinfo ENOTFOUND host
[SIGNUP] Error code: ENOTFOUND
[SIGNUP] Full error: Error: getaddrinfo ENOTFOUND host
```

---

## 🔴 Troubleshooting by Log Message

### **Symptom: `/health` works but `/api/auth/signup` fails**

**Step 1: Check server startup logs**

Look for:
```
[DB] DATABASE_URL present: true
[DB] Is Railway: YES
```

If `DATABASE_URL present: false` → **Add DATABASE_URL to Railway env vars**

**Step 2: Check signup error logs**

If you see:
```
[SIGNUP] ERROR: getaddrinfo ENOTFOUND host
```

This means the Pool is trying to connect but the hostname can't be resolved.

**Possible causes:**
1. DATABASE_URL is set but malformed (typo in hostname)
2. PostgreSQL service is not running in Railway
3. Network connectivity issue between app and database

**What to check:**
- Is PostgreSQL service in Railway showing "Running"?
- Does DATABASE_URL match what Railway shows?
- Is there a typo in the hostname?

---

### **Symptom: Pool has connectionString: false**

This should never happen if DATABASE_URL is set, but if it does:

```javascript
[SIGNUP] Pool has connectionString: false
```

→ The Pool object doesn't have a valid connection string

**This means:**
- DATABASE_URL wasn't loaded when the pool was created
- Environment variables not loaded

**Fix:**
- Verify DATABASE_URL is set in Railway environment variables
- Restart deployment

---

### **Symptom: Database init error but health works**

```
⚠ Database initialization error: error message
✓ Server running on 0.0.0.0:3000
```

→ **This is OK.** Server continues and will retry DB on first query.

But if signup then fails:
→ Check if PostgreSQL service is actually running in Railway

---

## 🧪 Testing Procedure

### **1. Verify Server Started (no logs needed)**
```bash
curl https://YOUR_BACKEND_URL/health
# Expected: {"status":"ok","timestamp":"..."}
```

### **2. Check Railway Logs**
Go to Railway dashboard → hireflow-backend → Logs tab

Look for:
- ✅ `[DB] DATABASE_URL present: true`
- ✅ `[DB] Is Railway: YES`
- ✅ `✓ Server running on 0.0.0.0:3000`

### **3. Test Signup**
```bash
curl -X POST https://YOUR_BACKEND_URL/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

Check Railway logs for:
- ✅ `[SIGNUP] Request received for email: test@example.com`
- ✅ `[SIGNUP] Attempting database query...`
- ✅ `[SIGNUP] Success! User created: test@example.com`

Or if it fails:
- ❌ `[SIGNUP] ERROR: getaddrinfo ENOTFOUND host`

---

## 🎯 What Should Be True After This Fix

1. **Single Pool Instance**
   - Only one `new Pool()` in the entire codebase (in `src/config/db.js`)
   - All routes import and reuse this pool

2. **DATABASE_URL Only**
   - No `DB_HOST`, `DB_USER`, `DB_PASSWORD` anywhere
   - Pool uses only `process.env.DATABASE_URL`

3. **Clear Diagnostics**
   - Server startup shows DATABASE_URL status
   - Signup logs show which database operation failed
   - Error codes included for debugging

4. **No Hidden Connections**
   - grep reveals no other `new Pool` or `pg.connect` calls
   - All imports point to single shared pool

---

## 📊 Log Verification Checklist

After redeploy, verify:

- [ ] Server startup shows `[DB] DATABASE_URL present: true`
- [ ] Server startup shows `[DB] Is Railway: YES` (or NO if local)
- [ ] Server startup shows safe connection string (with `***`)
- [ ] Health endpoint returns `{"status":"ok"}`
- [ ] Signup attempt shows `[SIGNUP] Request received`
- [ ] Signup shows `[SIGNUP] Attempting database query...`
- [ ] Signup either shows `Success!` or specific error code
- [ ] Error is NOT `ENOTFOUND` (if it is, see troubleshooting above)

---

## 🔬 Debug Mode (If Still Stuck)

To get more detailed PostgreSQL connection logs, you can add:

```javascript
// In src/config/db.js, before pool creation:
pool.on('connect', (client) => {
  console.log('[DB] New client connected');
});

pool.on('error', (err, client) => {
  console.error('[DB] Unexpected error:', err);
  console.error('[DB] Client state:', client?.query ? 'ready' : 'failed');
});
```

But this is usually not necessary with the current logging.

---

## ✅ Success Indicators

**Backend is working correctly when:**

1. Health check responds: ✅
2. Server startup logs show DATABASE_URL: ✅
3. Signup creates user: ✅
4. Login returns token: ✅
5. No `ENOTFOUND` errors: ✅

---

## 📍 Files Modified

1. `src/config/db.js` — Added pool diagnostics
2. `src/routes/auth.js` — Added signup/login logging
3. `src/server.js` — Added startup diagnostics
4. `DEBUG_GUIDE.md` — This file (reference guide)

---

**After redeploy, check logs in Railway and paste the startup sequence. This will tell us exactly what's wrong.**
