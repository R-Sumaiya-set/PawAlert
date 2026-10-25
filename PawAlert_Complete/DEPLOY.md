# PawAlert – Free Deployment Guide (Supabase + Render)

**100% free plan · CV-ready production stack**

| Layer        | Service              | Plan   |
|--------------|----------------------|--------|
| Database     | Supabase (PostgreSQL)| Free   |
| Backend+UI   | Render Web Service   | Free   |

---

## Part 1 – Create Supabase project (5 minutes)

1. Go to https://supabase.com → **Start your project** (sign in with GitHub).
2. **New project**
   - Name: `pawalert`
   - Database password: choose a strong password (save it)
   - Region: closest to you (e.g. Singapore / Mumbai)
   - Plan: **Free**
3. Wait until the project is ready (~1–2 min).

### Run the schema

4. In the left menu open **SQL Editor** → **New query**.
5. Copy the entire contents of `supabase/schema.sql` and click **Run**.
6. You should see “Success. No rows returned”.

### Get API keys

7. Go to **Project Settings → API**.
8. Copy and save:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** key (secret) → `SUPABASE_SERVICE_ROLE_KEY`  
     ⚠️ Never expose the service_role key in frontend code.

---

## Part 2 – Deploy on Render (free)

1. Go to https://render.com → sign up with GitHub (free).
2. Push this project to a **public GitHub repository** (or private if you connect Render to it).

   ```bash
   # from the PawAlert folder on your PC
   git init
   git add .
   git commit -m "PawAlert production ready"
   # create a repo on GitHub, then:
   git remote add origin https://github.com/YOUR_USERNAME/pawalert.git
   git branch -M main
   git push -u origin main
   ```

3. In Render dashboard → **New +** → **Web Service**.
4. Connect the GitHub repo.
5. Settings:

   | Field              | Value                          |
   |--------------------|--------------------------------|
   | Name               | `pawalert`                     |
   | Region             | Singapore (or closest)         |
   | Root Directory     | `backend`                      |
   | Runtime            | Node                           |
   | Build Command      | `npm install`                  |
   | Start Command      | `node server.js`               |
   | Instance Type      | **Free**                       |

6. **Environment Variables** (click “Add Environment Variable”):

   | Key                         | Value                                      |
   |-----------------------------|--------------------------------------------|
   | `SUPABASE_URL`              | your Project URL from Supabase             |
   | `SUPABASE_SERVICE_ROLE_KEY` | your service_role key                      |
   | `JWT_SECRET`                | any long random string (e.g. 32+ chars)    |
   | `PORT`                      | `10000` (Render sets this automatically; optional) |

7. Click **Create Web Service**.

8. Wait for the first deploy (~2–3 minutes).  
   Render free tier **spins down after ~15 min of no traffic**.  
   The first request after sleep takes 30–60 seconds (cold start) — normal for free plan.

9. Your live URL will look like:  
   `https://pawalert-xxxx.onrender.com`

---

## Part 3 – Seed demo data

After the first successful deploy, open the live URL once.  
The server automatically seeds demo accounts if the database is empty.

**Demo logins (password for all: `password123`)**

| Email              | Role         |
|--------------------|--------------|
| admin@pawalert.lk  | Admin        |
| nimal@carn.lk      | Coordinator  |
| saman@carn.lk      | Rescuer      |
| asha@email.com     | Reporter     |

If seed did not run, open Render → your service → **Shell** and run:

```bash
node -e "process.env.SUPABASE_URL=...; require('./db').helpers.seedIfEmpty()"
```

(Or just hit the site once and check logs for “Seeded demo data”.)

---

## Part 4 – Test the live site

1. Open `https://YOUR-APP.onrender.com`
2. Report an animal as guest.
3. Login as `nimal@carn.lk` → verify → assign.
4. Login as `saman@carn.lk` → accept → update status.
5. Track the case with the tracking code.

---

## Architecture (for CV / report)

```
Browser (PWA)
    │  HTTPS
    ▼
Render Web Service  ── Node.js (pure http server)
    │                     ├── REST API  /api/*
    │                     └── Static frontend
    ▼
Supabase PostgreSQL (free tier)
    ├── organizations, users, teams
    ├── cases, status_updates
    └── notifications
```

**Why this stack looks strong on a CV**
- Real relational database (PostgreSQL)
- Hosted API + responsive frontend
- Role-based access + JWT auth
- Immutable audit trail
- Free, public URL you can put in your portfolio

---

## Local development with Supabase

```bash
cd backend
npm install
set SUPABASE_URL=https://xxxx.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=eyJ...
set JWT_SECRET=dev-secret
node server.js
```

Without those env vars the app still runs with the local JSON database.

---

## Free-tier limits (honest)

| Service  | Limit                                      |
|----------|--------------------------------------------|
| Supabase | 500 MB DB, 2 GB bandwidth / month          |
| Render   | Spins down after inactivity; 750 hrs / mo  |

For a university demo / CV link this is more than enough.  
If you later need always-on, upgrade Render to the $7 starter plan.

---

## Troubleshooting

| Problem                         | Fix                                              |
|---------------------------------|--------------------------------------------------|
| 502 / app sleeping              | Wait 30–60 s and refresh (cold start)            |
| Login fails after deploy        | Check seed ran; check SUPABASE keys in env       |
| CORS errors                     | Already allowed (`*`) in server                  |
| “Missing SUPABASE_URL”          | Add env vars in Render and **redeploy**          |

---

**Project:** ITE 2952 · PawAlert · E2340183  
**Stack:** Node.js · Supabase PostgreSQL · Render
