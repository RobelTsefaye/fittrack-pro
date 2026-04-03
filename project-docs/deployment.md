# Deployment Guide — Vercel + Neon

## Overview

| Component | Service    | Tier |
| --------- | ---------- | ---- |
| App       | Vercel     | Free |
| Database  | Neon       | Free |
| Domain    | (optional) | —    |

---

## Step 1: Push Code to GitHub

```bash
# If not already a GitHub repo:
gh repo create fittrack-pro --private --source=. --push

# If already exists:
git add -A && git commit -m "chore: prepare for production deployment"
git push origin main
```

---

## Step 2: Create Neon Database

1. Go to [neon.tech](https://neon.tech) and sign up
2. Create a new project (name: `fittrack-pro`, region: closest to you)
3. Copy the connection string — it looks like:
   ```
   postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```
4. Keep this string ready for Step 3

---

## Step 3: Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"** → import your `fittrack-pro` repo
3. Before clicking Deploy, add **Environment Variables**:

| Variable              | Value                                                   |
| --------------------- | ------------------------------------------------------- |
| `DATABASE_URL`        | `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require` |
| `DIRECT_DATABASE_URL` | Same as `DATABASE_URL` (Neon uses the same for both)    |
| `AUTH_SECRET`          | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `AUTH_URL`            | `https://your-project.vercel.app` (update after first deploy) |
| `NEXT_PUBLIC_APP_URL` | `https://your-project.vercel.app` (same as above)       |

4. Click **Deploy**
5. After the first deploy, copy your actual Vercel URL (e.g. `https://fittrack-pro-abc.vercel.app`)
6. Update `AUTH_URL` and `NEXT_PUBLIC_APP_URL` with the real URL → Redeploy

---

## Step 4: Seed the Database

After the first deploy, the database has tables but no default exercises. Run:

```bash
# Set the production DATABASE_URL temporarily
export DIRECT_DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require"
npm run db:seed
```

Or run it from the Vercel dashboard → Functions → use the Neon SQL Editor to verify data.

---

## Step 5: Verify

1. Visit your Vercel URL
2. Register a new account
3. Check `/api/health` returns `{"status":"ok","db":"connected"}`

---

## Custom Domain (Optional)

1. In Vercel project → Settings → Domains
2. Add your domain (e.g. `fittrack.yourdomain.com`)
3. Update DNS as instructed
4. Update `AUTH_URL` and `NEXT_PUBLIC_APP_URL` env vars to the new domain

---

## Ongoing Maintenance

### Adding New Features

1. Develop locally with `npx prisma dev` + `npm run dev`
2. If schema changes: `npx prisma migrate dev --name feature-name`
3. Push to GitHub → Vercel auto-deploys
4. Migrations run automatically during build (`vercel-build` script)

### Updating Dependencies

```bash
npm update          # Minor/patch updates
npx npm-check-updates -u  # Check for major updates (review carefully)
npm run build       # Verify nothing breaks
```

### Monitoring

- Vercel dashboard: deploy logs, function logs, analytics
- `/api/health`: uptime monitoring endpoint
- Neon dashboard: query stats, storage usage

---

## Environment Variable Reference

| Variable              | Required | Where Used                     |
| --------------------- | -------- | ------------------------------ |
| `DATABASE_URL`        | Yes      | Prisma client, migrations      |
| `DIRECT_DATABASE_URL` | No       | Overrides DATABASE_URL if set  |
| `AUTH_SECRET`          | Yes      | NextAuth JWT signing           |
| `AUTH_URL`            | Yes      | NextAuth callback URLs         |
| `NEXT_PUBLIC_APP_URL` | No       | Client-side meta tags          |
