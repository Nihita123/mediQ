# MediQ — Deployment Guide

Target stack: **Frontend → Vercel** | **Backend → Render or Railway** | **Database → MongoDB Atlas**

---

## Architecture Overview

```
┌──────────────────────────────┐
│  React Client (Vite)         │  → deployed as static site on Vercel
│  Tailwind + Radix UI         │
└──────────────┬───────────────┘
               │ HTTPS / JSON (JWT Bearer token)
┌──────────────▼───────────────┐
│  Express API (Node 18+)      │  → deployed as web service on Render/Railway
│  Port 5000 (or $PORT)        │
└──────────┬───────────────────┘
           │
┌──────────▼───────────────────┐
│  MongoDB Atlas               │  → free M0 cluster is fine for MVP
└──────────────────────────────┘
```

---

## Required Environment Variables

### Backend (`server/.env` in dev, platform env vars in production)

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | Set to `production` on the server |
| `PORT` | No | Defaults to `5000`; Render/Railway set this automatically |
| `MONGO_URI` | **Yes** | MongoDB Atlas connection string |
| `JWT_SECRET` | **Yes** | Random string, 32+ characters |
| `JWT_EXPIRES_IN` | No | Token lifetime, default `7d` |
| `ALLOWED_ORIGINS` | **Yes** | Comma-separated frontend URLs, no trailing slashes |
| `LLM_PROVIDER` | No | `openai`, `gemini`, or `ollama`; auto-detected from keys |
| `LLM_TIMEOUT_MS` | No | LLM request timeout in ms, default `45000` |
| `OPENAI_API_KEY` | No* | Required only if using OpenAI |
| `OPENAI_MODEL` | No | Default `gpt-4o-mini` |
| `GEMINI_API_KEY` | No* | Required only if using Gemini |
| `GEMINI_MODEL` | No | Default `gemini-1.5-flash` |
| `OLLAMA_URL` | No* | Required only if using local Ollama |
| `OLLAMA_MODEL` | No | Default `llama3` |

*Set at least one LLM key for AI-powered triage. Without any key the system runs in rule-based fallback mode automatically.

**Rate limit overrides (optional):**

| Variable | Default | Description |
|---|---|---|
| `RATE_LOGIN_WINDOW_MS` | `900000` | 15 min window for login attempts |
| `RATE_LOGIN_MAX` | `10` | Max login attempts per window per IP |
| `RATE_REGISTER_WINDOW_MS` | `3600000` | 1 hour window for registrations |
| `RATE_REGISTER_MAX` | `5` | Max registrations per window per IP |
| `RATE_TRIAGE_START_WINDOW_MS` | `3600000` | 1 hour window for new sessions |
| `RATE_TRIAGE_START_MAX` | `10` | Max new sessions per window per IP |
| `RATE_TRIAGE_MSG_WINDOW_MS` | `60000` | 1 min window for triage messages |
| `RATE_TRIAGE_MSG_MAX` | `20` | Max messages per minute per IP |

### Frontend (`client/.env` in dev, Vercel env vars in production)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | **Yes** | Full backend URL, e.g. `https://mediq-api.onrender.com/api` |
| `VITE_APP_NAME` | No | App display name |

---

## MongoDB Atlas Setup

1. Create a free account at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create a new **free M0 cluster** (any region close to your backend)
3. Under **Database Access** → create a user with username + password (save these)
4. Under **Network Access** → add `0.0.0.0/0` for MVP (restrict to your server IP in production)
5. Under **Connect** → choose "Connect your application" → copy the connection string
6. Replace `<password>` in the string with your DB user's password
7. Set this as `MONGO_URI` in your backend environment

Example URI format:
```
mongodb+srv://mediquser:yourpassword@cluster0.xxxxx.mongodb.net/mediq?retryWrites=true&w=majority
```

---

## Backend Deployment (Render)

1. Push your code to GitHub (make sure `.env` is in `.gitignore` — it is)
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Set the following:
   - **Root directory:** `server`
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Node version:** 18 or higher
5. Under **Environment** tab, add all required variables from the table above
6. Deploy — Render will give you a URL like `https://mediq-api.onrender.com`

### Railway (alternative)

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select your repo, set root directory to `server`
3. Railway auto-detects Node.js and uses `npm start`
4. Add environment variables in the **Variables** tab
5. Railway provides a URL automatically

---

## Frontend Deployment (Vercel)

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Set the following:
   - **Root directory:** `client`
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
   - **Install command:** `npm install`
3. Under **Environment Variables**, add:
   - `VITE_API_URL` = `https://your-backend-url.onrender.com/api`
4. Deploy — Vercel gives you a URL like `https://mediq.vercel.app`
5. Go back to your **backend** environment variables and update:
   - `ALLOWED_ORIGINS` = `https://mediq.vercel.app`
6. Redeploy the backend after updating `ALLOWED_ORIGINS`

---

## Build and Start Commands

```bash
# ─── Backend ───────────────────────────────────────────────────────────────────
cd server
npm install
npm start          # production
npm run dev        # development (nodemon)

# ─── Frontend ──────────────────────────────────────────────────────────────────
cd client
npm install
npm run build      # outputs static files to client/dist/
npm run preview    # local preview of production build
npm run dev        # development server on port 5173
```

---

## CORS Configuration

The backend reads `ALLOWED_ORIGINS` as a comma-separated list:

```
# Single origin
ALLOWED_ORIGINS=https://mediq.vercel.app

# Multiple origins (staging + production)
ALLOWED_ORIGINS=https://mediq.vercel.app,https://mediq-staging.vercel.app
```

- No trailing slashes
- No wildcards (`*`) in production
- The Vite dev proxy handles `/api` in development automatically — `ALLOWED_ORIGINS` only affects the deployed backend

---

## Health Check

After deployment, verify the backend is running:

```
GET https://your-backend-url.onrender.com/api/health
```

Expected response (HTTP 200):
```json
{ "status": "ok", "service": "MediQ API", "timestamp": "..." }
```

This endpoint requires no authentication and can be used as a Render/Railway health check URL.

---

## How to Create Doctor / Admin Accounts

Public registration is intentionally locked to the `patient` role.

To promote an existing user to `doctor` or `admin`:

**Option A — MongoDB Atlas UI:**
1. Open Atlas → Browse Collections → `users` collection
2. Find the user document by email
3. Click Edit → change `"role": "patient"` to `"role": "doctor"` (or `"admin"`)
4. Save

**Option B — MongoDB Shell / Compass:**
```js
db.users.updateOne(
  { email: "doctor@hospital.com" },
  { $set: { role: "doctor" } }
)
```

**Option C — Any MongoDB client using your Atlas URI:**
```js
const mongoose = require('mongoose');
await mongoose.connect(process.env.MONGO_URI);
await mongoose.connection.collection('users').updateOne(
  { email: 'doctor@hospital.com' },
  { $set: { role: 'doctor' } }
);
```

> There is intentionally no public API endpoint to change roles. Do NOT create one.

---

## Production Checklist

### Before deploying:
- [ ] `npm run build` succeeds in `client/` with no errors
- [ ] `node --check app.js` passes in `server/`
- [ ] All required env vars are set in the platform dashboard
- [ ] `JWT_SECRET` is a random 32+ character string (not the example value)
- [ ] `MONGO_URI` points to your Atlas cluster (not localhost)
- [ ] `ALLOWED_ORIGINS` is set to your exact Vercel URL
- [ ] `NODE_ENV=production` is set on the backend
- [ ] `.env` files are NOT committed to git (check `git status`)

### After deploying:
- [ ] `GET /api/health` returns `200 OK`
- [ ] Registration flow works end-to-end
- [ ] Login and JWT auth works
- [ ] Triage chat starts and responds
- [ ] Session history loads
- [ ] Session summary/report page loads
- [ ] No CORS errors in browser console
- [ ] No API keys visible in browser network tab responses
- [ ] At least one doctor/admin account promoted in Atlas

---

## Security Considerations

1. **JWT in localStorage** — acceptable for MVP; for higher security migrate to httpOnly cookies in a future iteration

2. **MongoDB Network Access** — restrict Atlas IP allowlist to your Render/Railway server IP once you know it (instead of `0.0.0.0/0`)

3. **Rate limits** — sensible defaults are set. Tune via env vars if you see legitimate traffic being blocked

4. **LLM API keys** — stored as backend-only env vars; never sent to the frontend. The client has no access to them

5. **Error responses** — production mode returns sanitised messages only; full errors are logged server-side

6. **Helmet** — HTTP security headers are applied automatically on every response

7. **HTTPS** — handled by Render/Railway/Vercel at the platform level; no extra config needed

8. **Medical data** — conversation transcripts are stored in MongoDB. Ensure your Atlas cluster is in a region appropriate for your users. For a real production healthcare deployment, review HIPAA/GDPR requirements

---

## Logs

- **Render:** available in the Dashboard → Logs tab
- **Railway:** available in the Deployments → Logs view
- **Format:** `combined` Apache format in production (includes IP, method, path, status, response time)
- **What is logged:** requests, auth failures, LLM errors, DB errors
- **What is NOT logged:** passwords, JWT tokens, API keys, full medical transcripts
