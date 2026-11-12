# Baseline FitTrack (2026-11-12, Branch refactor/audit-2026-11)

| Befehl | Ergebnis vorher | Ergebnis nach Characterization-Tests |
|---|---|---|
| `npm ci` | ok | – |
| `npm run lint` | grün | grün |
| `npm run typecheck` | grün | grün |
| `npm test` | 15 Dateien, 62 Tests | 26 Dateien (+1 übersprungen), 178 Tests grün, 6 todo |
| `npm run build` (Platzhalter-Env, ohne DB) | Exit 0 | – |

Nicht Teil der Baseline: `npm run build:native` (verschiebt temporär `middleware.ts`/`src/app/api`), MCP-Paket-Typecheck, Swift/Xcode (hier nicht möglich).

Neue Tests: Auth-Abdeckung aller 80 `route.ts` (8 Allowlist-Einträge, 0 unklar), Zod-Schemas, `withApi`, `api-auth`, `oauth-crypto` (Ist-Verhalten inkl. Fallback-Secret), `personal-record`, Offline-Queue-Flush (KB-11), `health-data`-Upsert (KB-I), i18n-Parität (780 Schlüssel identisch). KB-09/KB-10 sind als `todo` markiert (UI/Swift, nicht ohne neue Abhängigkeiten testbar).
