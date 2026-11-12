# Deployment Guide — Vercel + Neon

> **Alternative: Self-hosting on the Mac (no Vercel).** Used when Vercel pauses the Hobby account (fair-use limit,
> Nov 2026). Next.js runs under launchd on port 3005, Tailscale Funnel serves it on
> `https://macbook-air-von-robel.tailfff213.ts.net` (port 443), Neon stays the database.
> `scripts/selfhost.sh install | update | status | stop | log`. Needs a `.env` with the production values
> (`DATABASE_URL`, `DIRECT_DATABASE_URL`, same `AUTH_SECRET` as Vercel so sessions/native tokens stay valid,
> `AUTH_URL` = the public address, `AUTH_TRUST_HOST=true`, `NEXT_PUBLIC_APP_URL`, AI keys). The native app calls
> that address (`src/lib/constants.ts` + the four `apiBaseURL`/`baseURL` constants in `ios/App/App/*.swift`);
> rebuild it with `npm run sync:native`. Nexus on the same Mac can use `FITTRACK_API_URL=http://127.0.0.1:3005`.
> The Mac must be awake and online (Nexus watchdog keeps it awake on mains power).

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
3. Schema changes are applied automatically during the Vercel build:
   `vercel-build` runs `scripts/db-sync-on-build.mjs` before `next build`.
   It tries `prisma migrate deploy`, falls back to a non-destructive
   `prisma db push` (no `--accept-data-loss`, so anything that would drop
   data aborts), and otherwise fails the build — Vercel then keeps serving
   the previous deployment. Preview deployments run it too, against
   whatever `DATABASE_URL` the preview environment has.
   Manual alternative: `DATABASE_URL=<prod> node scripts/db-sync-on-build.mjs`.
4. Push to GitHub → Vercel auto-deploys

### Runtime

- Node 22 (`.nvmrc`); use the same version locally and for the Vercel project.
- The Prisma pg pool keeps idle connections for 60 s (`idleTimeoutMillis` in `src/lib/prisma.ts`) so requests after a short pause do not reconnect to Neon.

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
