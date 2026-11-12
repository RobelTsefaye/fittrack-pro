# Werkzeug-Auswertung FitTrack (Phase 3, 2026-11-12)

| Werkzeug | Ausgeführt | Treffer | Echt | Hinweis |
|---|---|---|---|---|
| gitleaks Historie | ja | 1 | 1 (FT-TOOL-01) | |
| gitleaks Dateien | ja | 10 | 0 im Repo | alle in `.next/` (gitignored); FT-SEC-01 wurde nicht erkannt |
| semgrep (lokale Regelsätze javascript/typescript/secrets) | ja, 432 Regeln | 589 | ca. 8 | ca. 580 Stil/i18n |
| knip | ja | 53 | Gruppen FT-TOOL-06/07 | `mcp/`, `scripts/`, `sw.js` False Positives |
| depcheck | ja | 1 fehlend, 10 ungenutzt | `dotenv` | `@prisma/client` u. a. False Positives |
| madge | ja | 22 Zyklen | 1 | 21 im generierten Prisma-Code |
| npm audit | ja | 56 | 0 neu | siehe `03-dependencies.md` |
| prisma validate | ja | valid | 0 | |
| Coverage | nein | – | – | `@vitest/coverage-v8` nicht installiert |
| swiftlint / xcodebuild | nein | – | – | nur auf dem Mac möglich |

## Echte Treffer

- **FT-TOOL-01 (kritisch, neu): Exfiltrations-Workflow in der CI-Historie von `main`.** `.github/workflows/ci.yml` enthielt in den Commits `dcaad61`, `4e80e13` (10.11.), `1206983` (11.11.) und `8335fe0` (12.11., 03:09) einen Workflow, der bei Push `toJSON(secrets)`/`toJSON(vars)` sammelt, ein OIDC-Token anfordert und per HTTP an eine fremde IP schickt. Jeweils wenige Sekunden später stellt ein Commit „ci: restore“ den harmlosen Stand wieder her (`e2d0e01`, `c7dbdbb`, `d0cdc1e`). Der aktuelle Stand von `ci.yml` ist sauber. Ein gleichartiger Workflow wurde schon am 11.09. entfernt (`7330d66`, „malicious secret-exfiltration“). Die Autor-Angabe der Commits ist fälschbar. Muster (Push, wenige Sekunden später Restore) deutet auf automatisierte Nutzung eines Push-fähigen Zugangs hin (Vermutung).
- **FT-SEC-01 (kritisch, bestätigt):** DB-Zugangsdaten in `.claude/settings.local.json`; gitleaks erkennt sie nicht (kein Fehlalarm-Nachweis).
- **FT-TOOL-02 (mittel):** Kein Secret-Scan in CI, keine Regel für Datenbank-URLs. Fix: gitleaks in CI und pre-commit, Push Protection aktivieren. Aufwand S.
- **FT-TOOL-03 (niedrig):** `Fitapp/` (Prototyp): `postMessage(…, '*')` in `tweaks-panel.jsx`, Syntaxfehler in `screen-active-workout.jsx:214`. Entfernen nur nach Rücksprache.
- **FT-TOOL-04 (niedrig, Vermutung, KB-09):** Rollback in `workout-detail.tsx:767/781` kann bei Doppel-Reorders veralten.
- **FT-TOOL-05 (niedrig):** Zyklus `rest-timer-context.tsx` ↔ `rest-timer-bar.tsx`.
- **FT-TOOL-06 (niedrig):** 18 ungenutzte Dateien, 68 Exporte, 84 Typen.
- **FT-TOOL-07 (niedrig):** `dotenv` und `postcss` werden importiert, sind aber nicht in `package.json` deklariert; ungenutzt zu prüfen: `pg`, `@ai-sdk/react`, `tw-animate-css`.
- **FT-TOOL-08 (niedrig):** 10 gitleaks-Treffer in `.next/` (gitignored, Build-Schlüssel).
