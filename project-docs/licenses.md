# Lizenzen (FT-DEP-17)

## Lizenz dieses Repos

Das Repo enthält keine `LICENSE`-Datei. `package.json` (und `mcp/fittrack-mcp/package.json`) sind `"private": true`.
Gilt damit: **privates Projekt, alle Rechte vorbehalten**. Eine andere Lizenz (z. B. MIT für das Portfolio) ist eine
Entscheidung des Eigentümers; bis dahin keine `LICENSE`-Datei anlegen.

## Direkte Abhängigkeiten (Stand `package-lock.json`, Lizenzfeld aus den installierten Paketen)

Alle direkten Laufzeit- und Entwicklungsabhängigkeiten sind permissiv.

| Lizenz | Pakete |
| --- | --- |
| MIT | `@base-ui/react`, `@capacitor/{app,cli,core,haptics,ios,local-notifications,network,push-notifications}`, `@dnd-kit/{core,sortable,utilities}`, `clsx`, `date-fns`, `next`, `next-themes`, `pg`, `react`, `react-dom`, `recharts`, `shadcn`, `sonner`, `tailwind-merge`, `three`, `tw-animate-css`, `zod`; dev: `@tailwindcss/postcss`, `@types/*`, `eslint`, `eslint-config-next`, `prettier`, `tailwindcss`, `vite-tsconfig-paths`, `vitest` |
| Apache-2.0 | `@ai-sdk/google`, `@prisma/adapter-pg`, `@prisma/client`, `ai`, `class-variance-authority`, `dexie`, `prisma`; dev: `typescript` |
| BSD-3-Clause | `bcryptjs` |
| BSD-2-Clause | dev: `dotenv` |
| ISC | `lucide-react`, `next-auth` |

## Transitive Abhängigkeiten mit Copyleft

| Paket | Lizenz | Einordnung |
| --- | --- | --- |
| `@img/sharp-libvips-*` | LGPL-3.0-or-later | Optional über `next` (Bildoptimierung); die statisch gebaute Capacitor-App enthält es vermutlich nicht (nicht geprüft). Dynamisch gelinkte Binärpakete. |
| `lightningcss` | MPL-2.0 | Nur Build (CSS), wird nicht ausgeliefert. |
| `axe-core` | MPL-2.0 | Nur Entwicklung (über `eslint-plugin-jsx-a11y`). |

Die Capacitor-App bündelt nur die Laufzeitabhängigkeiten; alle direkten davon sind permissiv. Sollte das Repo
öffentlich oder die App verteilt werden: Lizenztexte (MIT/Apache/BSD/ISC-Hinweise) in einem Dritthinweis mitliefern
und `npm ls --all` bzw. ein Lizenzwerkzeug gegen die dann aktuelle `package-lock.json` laufen lassen.

Die Tabelle ist eine Momentaufnahme (Versionen siehe `package-lock.json`); beim Hinzufügen von Abhängigkeiten
nachziehen.
