# FitTrack Pro

Fitness-Tracker (Portfolio-Projekt): Training, Pläne, Rekorde, Körpergewicht, Ernährung und Gesundheitsdaten, als
Web-App und als iOS-App (Capacitor) mit Apple Watch und Widgets. Strukturierte JSON-Schnittstellen für LLM-Agenten
(`/api/ai/*`, Remote-MCP, lokaler MCP-Server).

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Prisma 7 mit PostgreSQL (Neon),
NextAuth.js v5 (beta), Zod 4, Recharts, AI SDK 6, Capacitor 8. Node 22 (`.nvmrc`).

Hinweis: Next.js 16 weicht von älterem Wissen ab (`params` ist ein Promise, `proxy` statt `middleware`). Siehe
`AGENTS.md` und `node_modules/next/dist/docs/`.

## Lokal starten

```bash
npm install
cp .env.example .env      # Werte eintragen, siehe project-docs/deployment.md
npx prisma dev            # lokale Datenbank + Migrationen (alternativ DATABASE_URL auf eine eigene Datenbank)
npm run dev               # http://localhost:3000
```

Fehlt eine Spalte ("column ... does not exist"), ist die Datenbank hinter dem Schema: `npm run db:push` (lokal) oder
`npm run db:migrate`, danach `npm run dev` neu starten.

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm test` | Vitest-Unit-Tests (`src/**/__tests__/*.test.ts`) |
| `npm run typecheck` / `npm run lint` | TypeScript bzw. ESLint |
| `npm run db:migrate` | `prisma migrate deploy` (vorhandene Migrationen anwenden) |
| `npm run db:push` | `prisma db push` (gesamtes Schema ohne Migrationsdateien, nur lokal) |
| `npx tsx scripts/seed-demo.ts <email>` | Demodaten, nur gegen lokale Datenbank |
| `npm run sync:native` | Native Build für die iOS-App, danach `open ios/App/App.xcodeproj` |
| `npm run format -- <dateien>` | Prettier für einzelne Dateien |

## Betrieb

Seit November 2026 läuft die App selbst gehostet auf dem Mac (`scripts/selfhost.sh`, launchd, Port 3005, Tailscale
Funnel auf :443); Vercel ist pausiert. Neon bleibt die Datenbank. Anleitung, Umgebungsvariablen, Rollback sowie
Rotation von Secrets und Tokens: `project-docs/deployment.md`.

## Dokumentation

- `project-docs/`: Architektur, Datenbankschema, API-Routen, AI-API (`ai-api.md`), Deployment, Roadmaps
- `mcp/fittrack-mcp/README.md`: Claude-Anbindung (Remote-MCP und lokaler stdio-Server)
- `project-docs/licenses.md`: Lizenzstatus und Drittlizenzen
- `docs/audit/`: Audit 2026-11 (Befunde, Priorisierung, bekannte Fehler)

## Lizenz

Privates Projekt, keine Lizenz vergeben: alle Rechte vorbehalten. Details und Drittlizenzen in
`project-docs/licenses.md`.
