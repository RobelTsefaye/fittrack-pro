# Deployment Guide — Selfhost (Mac) oder Vercel, jeweils mit Neon

> **Aktueller Betrieb: Self-hosting on the Mac (no Vercel).** Vercel ist pausiert (Hobby-Limit, Nov 2026); die
> Schritte 1 bis 5 weiter unten beschreiben den Vercel-Weg und gelten nur, wenn Vercel wieder genutzt wird.
> Next.js läuft unter launchd (`com.fittrack.web`) auf Port 3005, Tailscale Funnel liefert es unter
> `https://macbook-air-von-robel.tailfff213.ts.net` (Port 443) aus, Neon bleibt die Datenbank.
> Siehe Abschnitt "Selfhost auf dem Mac".

## Selfhost auf dem Mac

`scripts/selfhost.sh install | update | status | stop | log` (Details im Kopf des Skripts).

- `install`: bauen, Datenbankschema angleichen (`scripts/db-sync-on-build.mjs`), launchd-Dienst einrichten, Funnel auf :443.
- `update`: `git pull`, bauen, Schema angleichen, Dienst neu starten. Der Build läuft in das `.next` des laufenden
  Dienstes; scheitert er, bleibt ein halber Build und es gibt kein automatisches Zurück (dann `git checkout` auf den
  letzten guten Stand und `update` erneut).
- Port: `FITTRACK_PORT` (Default 3005); der Dienst übernimmt ihn nur beim `install`.
- Node 22 (`.nvmrc`); der Node-Pfad wird beim `install` in die Plist geschrieben. Ändert sich die Installation
  (z. B. Homebrew-Update), `install` erneut ausführen.
- Der Mac muss wach und online sein (der Nexus-Watchdog hält ihn am Netzteil wach); bei Ausfall sind App-Sync,
  Anmeldung und Remote-MCP nicht erreichbar. Gesundheitsprüfung: `GET /api/health` (liefert `db: connected`).
- Log: `~/Library/Logs/fittrack.log` (wird nicht rotiert).
- `.env` im Projektordner (nie committen). Pflicht laut Skript: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`. Zusätzlich
  nötig: `AUTH_TRUST_HOST=true` (Anmeldung hinter dem Funnel), `NEXT_PUBLIC_APP_URL`, die KI-Schlüssel;
  `DIRECT_DATABASE_URL` nur, wenn bewusst gesetzt (hat Vorrang, siehe Rotation).
  Gleicher `AUTH_SECRET` wie bei Vercel = Anmeldungen bleiben gültig.
- Adresse der nativen App: `NEXT_PUBLIC_API_ORIGIN` (Default in `src/lib/constants.ts`) plus die vier
  `apiBaseURL`/`baseURL`-Konstanten in `ios/App/App/*.swift`; Änderung = App neu bauen (`npm run sync:native`,
  dann `open ios/App/App.xcodeproj`). `NEXT_PUBLIC_*` und `NATIVE_BUILD` werden beim Build ins Bundle gebrannt.
- Nexus auf demselben Mac kann `FITTRACK_API_URL=http://127.0.0.1:3005` verwenden.

### Rollback auf Vercel

Kein Schalter, sondern ein Umzug: (1) Vercel-Projekt reaktivieren, Variablen wie in Schritt 3 setzen, `AUTH_URL` und
`NEXT_PUBLIC_APP_URL` auf die Vercel-Adresse; (2) in der nativen App die Basisadresse auf die Vercel-Adresse stellen
(`NEXT_PUBLIC_API_ORIGIN`, vier Swift-Konstanten) und die App neu bauen und installieren (kostenloses Entwicklerkonto:
Signatur 7 Tage gültig); (3) Nexus `FITTRACK_API_URL` bzw. Basisadresse anpassen; (4) `selfhost.sh stop`.
Beide Umgebungen teilen dieselbe Neon-Datenbank; nie gleichzeitig mit unterschiedlichem `AUTH_SECRET` betreiben.
Vercel ist laut Stand bis 10.12.2026 pausiert (KB-G in `docs/audit/KNOWN-BUGS.md`).

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
| `DIRECT_DATABASE_URL` | No       | **Takes precedence** over `DATABASE_URL` if set (`src/lib/prisma.ts`, `prisma.config.ts`) |
| `AUTH_SECRET`          | Yes      | NextAuth JWT (session cookie), AES key for MCP OAuth codes (`src/lib/oauth-crypto.ts`) |
| `AUTH_URL`            | Yes      | NextAuth callback URLs (public address; wrong value = login redirects point to the wrong host) |
| `AUTH_TRUST_HOST`     | Selfhost | `true` behind the Tailscale Funnel / any proxy (Vercel sets it implicitly) |
| `NEXT_PUBLIC_APP_URL` | No       | Client-side meta tags          |
| `NEXT_PUBLIC_API_ORIGIN` | No    | Base address the native app calls (baked into the build, default in `src/lib/constants.ts`) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No | In-app chat (`/api/chat`, Gemini); no caller in the UI at the moment |
| `FITTRACK_BASE_URL` / `FITTRACK_API_TOKEN` | MCP / scripts only | Used by `mcp/fittrack-mcp` and `npm run demo:ai`, not by the web app |
| `FITTRACK_PORT`       | No       | `scripts/selfhost.sh`, default 3005 |
| `NATIVE_BUILD`        | No       | Set to `1` by `scripts/build-native.mjs` for the static native build |
| `FITTRACK_REGISTRATION` | No     | `open` / `closed` (default `closed`): sign-up gate, see below |

### Registration gate and rate limits

- `FITTRACK_REGISTRATION` (`open` | `closed`, default `closed`): when `closed`, `POST /api/auth/register` returns 403 and
  `/register` shows a notice instead of the form. Exception (bootstrap): while the database contains no user at all,
  registration is allowed, so a fresh instance can create its first account. Set `open` only for a deliberately
  public instance. The native app (static export) shows the 403 message in the form.
- In-memory rate limit (`src/lib/rate-limit.ts`, per process, window 15 min): registration 10 attempts, login 20 attempts
  (NextAuth credentials and `/api/auth/native-login` share one counter). Exceeding it returns 429 with `Retry-After`
  (NextAuth login: treated like a failed login). A successful login resets the counter. The key is the client IP from
  `x-forwarded-for` / `x-real-ip` (else `unknown`). Behind the Tailscale Funnel the IP may be identical for every
  request, so all clients then share one counter; the limits are therefore generous.

---

## Rotation von Secrets und Tokens

Keine Werte in Chat, Commits oder Doku; neue Werte nur in der `.env` auf dem Mac, in Vercel (falls aktiv) und in
den Einstellungen der Konsumenten eintragen. Nach jeder Änderung an der `.env`:
`scripts/selfhost.sh update` bzw. Dienst neu starten.

| Secret | Rotieren | Folge |
| --- | --- | --- |
| Neon-Passwort (`DATABASE_URL`) | In Neon Passwort der Rolle ändern, dann **beide** Variablen `DATABASE_URL` **und** `DIRECT_DATABASE_URL` (falls gesetzt) auf Mac und Vercel auf die neue Verbindungszeichenfolge stellen, neu starten. `DIRECT_DATABASE_URL` hat Vorrang: wer nur `DATABASE_URL` ändert, läuft mit dem alten Passwort weiter und bekommt Fehler erst, wenn das alte gesperrt wird. Danach `/api/health` prüfen. Nexus und Skripte (`import-workouts.mjs`, `seed-demo.ts`) lesen dieselben Variablen. | Kurze Unterbrechung beim Neustart, kein Datenverlust |
| `AUTH_SECRET` | Neuen Wert erzeugen: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`; in **allen** Umgebungen (Mac, Vercel) gleichzeitig ersetzen, sonst loggen sie sich gegenseitig aus. | Alle Browser-Sitzungen (Cookies, 90 Tage) werden ungültig, Neu-Anmeldung nötig. Offene OAuth-Codes (5 Minuten) verfallen, Claude-Connector ggf. neu verbinden. **Native App, Watch, MCP und Skripte laufen weiter** (`ftp_`-Tokens hängen nicht an `AUTH_SECRET`); eine Rotation widerruft daher keine API-Tokens. |
| `AUTH_SECRET` ohne Ausloggen (ungeprüft) | Neuen Wert als `AUTH_SECRET_1` setzen und den alten `AUTH_SECRET` behalten; nach Ablauf der 90 Tage den alten entfernen. Vermutung nach dem Auth.js-Code, nicht ausgeführt. `oauth-crypto.ts` nutzt weiter nur `AUTH_SECRET`. | |
| `ftp_`-API-Tokens | Settings → API token: neues Token erzeugen, in den Konsumenten ersetzen (Nexus-`.env` und App-Keychain, `claude_desktop_config.json`, Remote-MCP-Eintrag in Claude), dann das alte in Settings löschen. Tokens haben keinen Ablauf; jeder Native-Login und jede MCP-Verbindung legt ein eigenes an, die alten dort ebenfalls löschen. Jedes Token hat Vollzugriff auf den Account (siehe `ai-api.md`), auch zum Erzeugen weiterer Tokens: bei Verdacht **alle** Tokens des Kontos löschen. | Konsumenten ohne neues Token erhalten 401 |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Schlüssel bei Google erneuern, Variable ersetzen, neu starten. | Kein Zustand im Code |

Reihenfolge bei einem vermuteten Leck (z. B. Zugangsdaten in einer Datei, die einmal im Repo lag): Neon-Passwort,
dann `ftp_`-Tokens, dann `AUTH_SECRET`; erst danach die Historie bereinigen.
Hinweis: `scripts/selfhost.sh` prüft nur `DATABASE_URL`, `AUTH_SECRET` und `AUTH_URL`; eine abweichende
`DIRECT_DATABASE_URL` fällt dort nicht auf.
