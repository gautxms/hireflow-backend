# Deploy to Railway

## Step 1: Create Railway Account
1. Go to https://railway.app
2. Sign up (free tier includes $5/month credit)
3. Create new project

## Step 2: Add PostgreSQL Database
1. In Railway project, click "+ Add"
2. Select "PostgreSQL"
3. Railway auto-provisions a database
4. Copy the `DATABASE_URL` (you'll need this)

## Step 3: Create GitHub Repository (if not already)
```bash
cd /home/ubuntu/.openclaw/workspace/hireflow-backend
git init
git add .
git commit -m "Initial commit: HireFlow auth backend"
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/hireflow-backend.git
git push -u origin main
```

## Step 4: Deploy Backend to Railway
1. In Railway project, click "+ Add"
2. Select "GitHub Repo"
3. Search for "hireflow-backend" and connect
4. Railway auto-deploys

## Step 5: Set Environment Variables in Railway
In Railway dashboard, go to Variables tab and set:

```
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://hireflow.dev
JWT_SECRET=use-output-from-step-6-below
DATABASE_URL=postgresql://... (auto-set by Railway)
```

**Important:** Generate a secure JWT_SECRET:
```bash
# Run this to generate JWT secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Copy output and paste into Railway's JWT_SECRET variable
```

## Step 6: Get Backend Public URL
After deployment, Railway assigns a public URL like:
```
https://hireflow-backend-prod-production.railway.app
```

Copy this URL - you'll set it as `VITE_API_BASE_URL` in Vercel.

## Step 7: Test Backend
```bash
# Health check
curl https://hireflow-backend-prod-production.railway.app/health

# Test signup
curl -X POST https://hireflow-backend-prod-production.railway.app/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

## Step 8: Set Vercel Env Var
1. Go to Vercel → hireflow-demo project → Settings → Environment Variables
2. Add: `VITE_API_BASE_URL` = `https://hireflow-backend-prod-production.railway.app`
3. Redeploy frontend

## Step 9: Merge Auth Code
```bash
cd /home/ubuntu/.openclaw/workspace/hireflow-demo
git checkout origin/codex/implement-signup-and-login-functionality
git push origin main
```

Vercel auto-deploys. Done! ✓

---

## Troubleshooting

**Backend not starting?**
- Check Railway logs (Dashboard → Deployments → View Logs)
- Verify JWT_SECRET is set
- Verify DATABASE_URL is set

**Database connection error?**
- Ensure PostgreSQL plugin is added to Railway project
- Check DATABASE_URL format: `postgresql://user:pass@host:5432/db`

**CORS error in browser?**
- Verify `FRONTEND_URL` in backend matches your Vercel domain
- Check CORS origins in src/server.js

---

**Status:** Ready for deployment  
**Estimated time:** 10-15 minutes  
**Cost:** Free (within Railway's free tier)
