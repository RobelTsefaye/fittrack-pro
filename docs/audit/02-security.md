# 02 Sicherheit (FitTrack Pro), Präfix FT-SEC-

Stand 2026-11-12, nur gelesen (keine Änderungen, kein Netzwerk gegen Produktion). Geprüft: Next 16.2.2 (Doku `node_modules/next/dist/docs/`: `middleware` ist dort als `proxy` umbenannt), alle 82 `route.ts` (80 unter `api/`, 2 unter `.well-known/`), Auth-Libs, Skripte, `git ls-files`/Historie (nur Dateinamen und Treffer-Anzahl, keine Werte).

## Zusammenfassung

1. **Kritisch (2):** `.claude/settings.local.json` ist im **öffentlichen** GitHub-Repo getrackt und enthält Zugangsdaten der Produktions-Datenbank (Historie, 2 Commits); der MCP-OAuth-Endpunkt `authorize` prüft `redirect_uri` nicht, fragt nicht um Zustimmung und erzwingt kein PKCE, so dass ein angeklickter Link ein dauerhaftes Vollzugriffs-Token liefert.
2. **Hoch (2):** Nirgends Rate-Limit/Bot-Schutz (Login, Native-Login, Registrierung, Token-Endpunkt); die offene Registrierung auf der per Funnel öffentlichen Instanz erlaubt jedem Konten, DB-Spam und Verbrauch des KI-Kontingents.
3. **Eigentümerprüfung (IDOR):** in allen geprüften Prisma-Abfragen vorhanden; eine Lücke (fremde `exerciseId` an Workout hängen, niedrig). Auth-Abdeckung: 72 Routen mit Auth, 8 bewusst öffentlich (Tabelle unten).
4. **Mittel:** ftp_-Tokens ohne Ablauf/Scopes/Rotation und können weitere Tokens erzeugen; Token in `?token=`-URL; keine Security-Header; Account-Enumeration; unbegrenzte KI-/SSE-/MCP-Batch-Last.
5. Positiv: Token-Hash SHA-256 (nur Hash gespeichert, 256 Bit Zufall), Keychain-Speicherung nativ, SW cacht `/api` nicht, Zod an fast allen Mutationen, `.env`/`*.pem` ignoriert, keine weiteren Secret-Muster in getrackten Dateien.

Anzahl: kritisch 2, hoch 2, mittel 7, niedrig 11 (gesamt 22; die Tabelle ist nach ID geordnet, nicht streng nach Schweregrad).

## Findings

| ID | Fundstelle | Schweregrad | Auswirkung | Fix-Vorschlag | Aufwand | Verhaltensrisiko |
|---|---|---|---|---|---|---|
| FT-SEC-01 | `.claude/settings.local.json:53-58,68-69,121,123` (getrackt; Historie: Commits `b1ce6c0` 2026-07-15, `4c52e65` 2026-07-21). GitHub-API: Repo `private=false` | kritisch | Die Datei enthält Postgres-Verbindungsstrings mit Passwort der Produktions-Datenbank (Neon) in mehreren Allow-Regeln (9 Treffer mit Passwort-Muster). Das Repo ist öffentlich: jeder kann die gesamte Datenbank (Workouts, Gewicht, Gesundheitsdaten, `users.passwordHash`) lesen/ändern/löschen. Auch ohne Löschen der Datei bleibt der Wert in der Historie und in Forks/Caches. | 1) Neon-Passwort **sofort rotieren**, neue URL in `.env` auf dem Mac und bei Vercel setzen. 2) Datei per `git rm --cached` entfernen, `.claude/settings.local.json` in `.gitignore`. 3) Historie bereinigen (`git filter-repo`) oder Repo vorübergehend privat stellen; Forks prüfen. 4) Tokens (`ftp_`) und `AUTH_SECRET` als vorsichtshalber rotieren (Vermutung, dass nur DB betroffen ist: Muster-Scan fand keine weiteren). | S (Rotation), M (Historie) | keins (Rotation: Apps neu mit DB-URL starten; alle Sessions bleiben nur bei unverändertem `AUTH_SECRET` gültig) |
| FT-SEC-02 | `src/app/api/mcp/oauth/authorize/route.ts:135-188`, `token/route.ts:261-314`, `register/route.ts:218-241`, `.well-known/oauth-authorization-server/route.ts:14` | kritisch | (a) `redirect_uri` wird weder gegen registrierte Clients noch eine Allowlist geprüft (Zeile 137, 184); `register` speichert nichts (Zeile 213-217 Kommentar), `client_id` wird nie verglichen. (b) Keine Zustimmungsseite: ist der Nutzer eingeloggt, wird sofort ein Token geminted (Zeile 161-172). (c) PKCE optional (`cc` nur geprüft wenn vorhanden, token:287), Default-Methode `plain` (Zeile 141, 286), Metadaten bewerben `plain`. (d) Token-Endpunkt prüft `ru`/`ci` aus dem Code nicht (Felder werden gemintet, nie verglichen). Angriff: Opfer (eingeloggt) öffnet `…/authorize?redirect_uri=https://evil/&response_type=code` (GET, SameSite=Lax erlaubt Top-Level-Navigation), Angreifer erhält `code` per Redirect und tauscht ihn am öffentlichen CORS-`*`-Token-Endpunkt gegen den echten `ftp_`-Token. Der Token hat Vollzugriff auf alle `/api/*` (Lesen, Schreiben, Löschen, Token-Erzeugung), kein Ablauf (token:310), Scope `mcp` wird nirgends geprüft. Zusätzlich: Codes sind zustandslos und innerhalb 5 min mehrfach einlösbar; auch ungültige `redirect_uri` erzeugt ein 500 (`new URL` Zeile 184 ohne try); `errorRedirect` (Zeile 190) ist ein offener Redirect auch ohne Login. | Clients persistieren (Tabelle `OAuthClient`: id, redirect_uris) oder feste Allowlist (`https://claude.ai/api/mcp/auth_callback` u. a.); exakter Vergleich von `redirect_uri` in authorize **und** token; Zustimmungsseite mit POST + CSRF-Token; PKCE S256 Pflicht (`plain` entfernen, Metadaten anpassen); Code einmalig (DB/Cache-Eintrag), `ru`/`ci` im Token-Endpunkt prüfen; Token mit Scope und Ablauf (siehe FT-SEC-05). | M | mittel (bestehende Claude-Connector-Einrichtung muss neu autorisiert werden; Redirect-Allowlist muss zum tatsächlichen Client passen) |
| FT-SEC-03 | `src/lib/auth.ts:15-31`, `src/app/api/auth/native-login/route.ts:77-118`, `auth/register/route.ts:17-50`, `middleware.ts:10-12`; Suche `429`/Rate-Limit: keine Treffer in `src/` | hoch | Kein Rate-Limit, kein Lockout, keine Captcha/Bot-Abwehr auf Login (NextAuth Credentials), Native-Login, Registrierung, Token-Endpunkt, `/api/chat`, MCP. Bei öffentlicher Funnel-Adresse (selfhost.sh:56) ist Passwort-Raten/Credential-Stuffing unbegrenzt möglich; jeder Erfolg am Native-Login liefert sofort einen dauerhaften Token. | Rate-Limit pro IP und pro E-Mail (z. B. Upstash/Redis oder DB-Tabelle mit Zähler; im Single-Host-Betrieb In-Memory-LRU im Proxy), 429 + Backoff, Lockout nach N Fehlversuchen; für Registrierung zusätzlich Bot-Schutz (Turnstile/hCaptcha) oder Einladungscode. | M | niedrig |
| FT-SEC-04 | `src/app/api/auth/register/route.ts:17-50`, `src/features/auth/schemas.ts:10-18`, `src/app/(auth)/register`, `middleware.ts:14-23` | hoch | Registrierung ist offen und anonym, ohne Schalter (`ALLOW_REGISTRATION`/Invite). Auf der öffentlichen Instanz (Funnel :443, Port 3005) kann jeder Konten anlegen und damit (a) DB-Zeilen anlegen (Neon-Limit), (b) CPU verbrennen: `bcryptjs` (reines JS) mit Cost 12 pro Anfrage, `name`/`email`/`password` ohne Maximallänge (Zeile 9-15 schemas.ts), Body unbegrenzt, (c) über `/api/chat` das Gemini-Kontingent verbrauchen (FT-SEC-12). Persönliches Portfolio-/Einzelnutzer-Szenario: Registrierung wird kaum gebraucht. | Env-Schalter `REGISTRATION_OPEN=false` (Default aus im Selbsthosting), 403 im Handler; oder Einladungscode; `max()` auf Name (80), E-Mail (254), Passwort (72, bcrypt-Grenze); Body-Größe begrenzen. | S | niedrig (Registrierung für neue Nutzer entfällt, bewusst) |
| FT-SEC-05 | `src/lib/api-auth.ts:6-37`, `api-token-crypto.ts:1-19`, `prisma/schema.prisma:88-101`, `auth/native-login/route.ts:96-108`, `src/lib/native/native-auth-token.ts:42` (kein Aufrufer gefunden), `tokens/route.ts:46-89` | mittel | Hash/Speicherung sauber (SHA-256 über 256-Bit-Zufall, nur Hash in DB, einmalige Anzeige; Hash ohne Salt ist bei 256 Bit Entropie vertretbar). Schwächen: kein `expiresAt`, kein Scope (jeder Token = Vollzugriff auf alle Routen, auch `/api/tokens` POST: ein gestohlener Token kann weitere Tokens erzeugen und überlebt damit das Widerrufen des ersten), keine Rotation, `lastUsedAt` wird nur gesetzt (kein Auffälligkeits-/Alters-Check); Native-Login erzeugt bei jedem Login einen neuen Token (`name: "Native App Login"`), Abmeldung widerruft serverseitig nichts (`clearNativeAuthToken` ohne Aufrufer; Vermutung: Funktion nur lokal) → Token häufen sich, ohne Obergrenze. Zwei Formate (`base64url` vs `hex`, verschiedene `tokenPrefix`-Länge) sind kosmetisch. | Spalten `expiresAt`, `scopes`, optional `kind` (`native`/`mcp`/`manual`); Standard-Ablauf (z. B. 90 Tage, Native 30 Tage mit Refresh); Token-Erzeugung nur per Session-Cookie (nicht per Bearer) erlauben; Native-Logout ruft `DELETE /api/tokens/{id}`; Obergrenze pro Nutzer; Settings-Seite zeigt `lastUsedAt`/Alter. | M | mittel (Bestehende Tokens müssen Default `expiresAt = null` behalten, sonst brechen Claude Desktop/Watch/Health-Sync) |
| FT-SEC-06 | `src/app/api/mcp/route.ts:586-592` | mittel | MCP akzeptiert den Token als `?token=` in der URL: landet in Access-/Proxy-Logs (launchd-Log, Tailscale, Browserverlauf), Referer. | Query-Parameter-Pfad entfernen oder nur mit kurzlebigem, an Pfad gebundenem Einmal-Token; Doku (`mcp/fittrack-mcp/README.md`) auf Header umstellen. | S | niedrig (Nutzer, die `?token=` im Claude.ai-Connector verwenden, müssen die URL anpassen) |
| FT-SEC-07 | `next.config.ts:1-33` (keine `headers()`), `middleware.ts` setzt keine Header | mittel | Keine Security-Header: kein CSP, kein `X-Frame-Options`/`frame-ancestors` (Clickjacking von Login/Settings/Token-Seite), kein HSTS (Funnel liefert TLS, HSTS fehlt), kein `nosniff`, keine `Referrer-Policy`/`Permissions-Policy`. | `headers()` in `next.config.ts`: `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, HSTS, CSP (zuerst Report-Only wegen Inline-Skripten/Capacitor). Für Native-Build (`output: "export"`) nicht anwendbar, dort Meta/Capacitor-Config. | S | mittel (CSP kann Inline-Skripte/Worker/Recharts blockieren; erst Report-Only) |
| FT-SEC-08 | `src/app/api/auth/register/route.ts:27-33`, `native-login/route.ts:84-94`, `src/lib/auth.ts:21-25` | mittel | Account-Enumeration: Register antwortet 409 „An account with this email already exists“. Bei Login/Native-Login wird `bcrypt.compare` nur bei vorhandenem Nutzer ausgeführt, bei unbekannter E-Mail antwortet der Server messbar schneller (Timing). | Register generisch antworten (Bestätigungs-Mail oder gleiche Antwort), im Login Dummy-`bcrypt.compare` gegen konstanten Hash ausführen; gleiche Fehlermeldung und Zeitbudget. Kombinieren mit FT-SEC-03. | S | niedrig (Register-UX: 409-Meldung „E-Mail vergeben“ entfällt) |
| FT-SEC-09 | `src/app/api/chat/route.ts:89-232` (v. a. 200-231), `mcp/route.ts:620-625`, `ai/*` (alle 15 `GET`) | mittel | Kostenmissbrauch/Last: `/api/chat` validiert den Body nicht (kein Zod, `req.json()` ohne try → 500 bei kaputtem JSON, Zeile 214), `messages` unbegrenzt in Anzahl/Länge (Eingabe-Tokens), nur `maxOutputTokens: 512`, kein Limit pro Nutzer/Zeit; mit offener Registrierung (FT-SEC-04) kann jeder das Gemini-Konto/Kontingent leeren. MCP-JSON-RPC-Batch (`Promise.all` über beliebig viele Nachrichten) und die `ai/*`-Endpunkte (jeweils schwere Aggregationen, ungecacht) multiplizieren die DB-Last pro Request. | Zod-Schema für `messages` (max. 20 Nachrichten, max. 4000 Zeichen), Tageskontingent pro User (DB-Zähler), Batch-Größe max. 10, Rate-Limit (siehe FT-SEC-03); `try/catch` um `req.json()`. | M | niedrig |
| FT-SEC-10 | `src/app/api/chat/route.ts:121-197`, `features/ai/context.ts`, `mcp/route.ts:284-500` | niedrig | Prompt-Injection-Fläche: Nutzertexte (Workout-/Plan-/Übungsnamen, Anzeigename, Zeile 123, 154, 167) werden ungefiltert in den System-Prompt interpoliert, und `ai/*`/MCP geben frei eingegebene Texte an externe Agenten. Mandantenübergreifend gibt es keine geteilten Texte (nur eigene Daten und globale Übungen `userId: null`), Wirkung daher auf den eigenen Account beschränkt; relevant wird es, wenn Importe (Health Auto Export, Fremd-Workouts) Namen setzen oder später Teilen eingeführt wird. Chat hat keine Tools, daher kein Aktionsrisiko. | Nutzertexte im Prompt klar abgrenzen (Delimiter, „Daten, keine Anweisungen“), Länge kappen; bei MCP-Tools Hinweis im Tool-Result. | S | keins |
| FT-SEC-11 | `src/app/api/cardio/live/stream/route.ts:92-95,143-172` | mittel | Jede SSE-Verbindung pollt die DB alle 300 ms bis zu 50 s; keine Begrenzung gleichzeitiger Streams pro Nutzer/Token. Ein authentifizierter Client (oder gestohlener Token) kann viele Streams öffnen → DB-Verbindungs-/Neon-Limit, Selbsthosting-CPU (KB-G). | Max. N Streams pro User (In-Memory-Zähler), Intervall auf 1 s, oder LISTEN/Notify/In-Memory-Broadcast statt Polling. | M | niedrig |
| FT-SEC-12 | `src/app/api/workouts/[id]/exercises/route.ts:36-47` (vgl. korrekt: `plan-sessions/[sessionId]/exercises/route.ts:29-32`) | niedrig | `exerciseId` wird nur als UUID geprüft (`features/workouts/schemas.ts:14`), nicht auf Sichtbarkeit (`userId null` oder eigene). Kennt jemand die UUID einer fremden Custom-Übung, hängt er sie an das eigene Workout; Name/Muskelgruppe/Equipment kommen in der Antwort zurück (Zeile 51-53 `include`). UUIDs sind nicht ratbar, Leck daher gering; FK-Verletzung → 500, falls die Übung fehlt. | `findExerciseVisibleToUser` vor `create` (wie in plan-sessions), 404 sonst. Gleiches Muster prüfen, wo `exerciseId` aus Body in `create` wandert (nur diese Stelle gefunden). | S | keins |
| FT-SEC-13 | `src/app/api/push-tokens/route.ts:30-33,15-20` | niedrig | `upsert` über global eindeutiges `token` setzt `userId` um (Kommentar Zeile 25 ist beabsichtigt): wer einen Gerätetoken kennt, kann Push-Benachrichtigungen auf den eigenen Account umleiten (Token schwer zu erraten). `token` ohne Maximallänge. Route nutzt nur `auth()` (Cookie), kein Bearer – Nativ mit Bearer-Login (FT-SEC-05) gibt 401 (funktional, Vermutung). | `token` max 256 Zeichen; Umhängen nur wenn bisheriger Besitzer nicht mehr gültig (oder Löschen + Neuanlage nach Bestätigung); ggf. `resolveUserIdForDataApi` verwenden. | S | niedrig |
| FT-SEC-14 | `src/lib/oauth-crypto.ts:3-6`, `src/lib/__tests__/oauth-crypto.test.ts` | niedrig | Fallback-Secret `"fallback-dev-secret"` im Code und Schlüssel `sha256(AUTH_SECRET)` ohne Domain-Trennung (gleiches Secret wie NextAuth-JWT). Ohne `AUTH_SECRET` bricht NextAuth ohnehin ab, der Fallback greift nur, wenn `NEXTAUTH_SECRET`/`AUTH_SECRET` fehlen und nur die OAuth-Codes betroffen sind; forged Codes brauchen zudem einen gültigen `s` (kein direkter Takeover). Rotation: ein Wechsel des Secrets macht Codes (5 min) und alle Sessions ungültig, aber kein Multi-Key-Verfahren. | Fallback entfernen (`throw` wenn Secret fehlt), Key per HKDF mit Kontext `"oauth-code"` ableiten, optional `OAUTH_CODE_SECRET`. Test anpassen (zeigt Ist-Verhalten). | S | niedrig |
| FT-SEC-15 | `src/lib/auth.config.ts:8-28`, `src/lib/auth.ts` | niedrig | NextAuth v5: `trustHost: true` fest (Zeile 9) – Host-Header wird immer vertraut; Basis-URL von OAuth-Metadaten und `WWW-Authenticate` aus `req.nextUrl` (`.well-known/*:8`, `mcp/route.ts:597`) → Host-Injection, wenn der Dienst direkt über LAN (`0.0.0.0:3005`, siehe FT-SEC-19) statt Funnel erreichbar ist. JWT-Session 90 Tage, stateless: Passwortwechsel/Abmeldung machen Cookies serverseitig nicht ungültig; JWT-Callback prüft nicht, ob der Nutzer noch existiert. Cookies sonst Defaults (HttpOnly, SameSite=Lax, Secure bei https-`AUTH_URL`). | `trustHost` nur per Env (`AUTH_TRUST_HOST`), Metadaten-Basis aus `AUTH_URL`; Session-Version (`tokenVersion` am User) im JWT-Callback; `maxAge` ggf. 30 Tage. | S | niedrig |
| FT-SEC-16 | `middleware.ts:10-12`, `src/app/api/__tests__/route-auth-coverage.test.ts:1-120` | niedrig | Kein Default-Deny: `middleware.ts` lässt `/api/*` und `/.well-known/*` ungeprüft durch; Auth hängt an jeder einzelnen Route. Der Test ist ein Textscan (Kommentar im Test: belegt nur, dass ein Aufruf im Handler steht, nicht dass er vor dem Datenzugriff greift). Aktuell 0 unklare Routen, daher nur Strukturrisiko für neue Routen. Next 16: `middleware` ist laut `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` veraltet und heißt `proxy` (Umbenennung steht an; `build-native.mjs` verschiebt `middleware.ts` namensabhängig). | Beim Umzug auf `proxy.ts`: in `/api` (außer Allowlist) Bearer-oder-Session-Vorprüfung ergänzen; Test um Laufzeit-Aufruf ohne Auth (401) je Route erweitern; `build-native.mjs` anpassen. | M | mittel (Native-Build und Dateiname müssen zusammen umgestellt werden) |
| FT-SEC-17 | `src/app/api/health-data/route.ts:508-600` (Logs 531, 537, 582, 586, 600) | niedrig | Der Health-Import loggt pro Anfrage Datum, Metriknamen, Schlafwerte, Workout-Typ, Dauer, kcal per `console.log` in `~/Library/Logs/fittrack.log` (selfhost.sh:23, 60; Standardrechte). Gesundheitsdaten im Klartext-Log; keine Rotation. Tokens/Passwörter werden nicht geloggt (geprüft). Der HAE-Pfad (`transformHAE`) hat unbegrenzte Array-Größe (Vermutung: kein Body-Limit, nur authentifiziert). | Logs auf Zählwerte reduzieren, hinter `DEBUG`-Flag; Log-Datei `chmod 600` und Rotation; Body-Größe begrenzen. | S | keins |
| FT-SEC-18 | `src/app/api/tokens/route.ts:34-41,79-86` | niedrig | Fehlerantworten enthalten `detail: e.message` und Hinweise zu Migrationen: Datenbank-/Prisma-Fehlertext an den Client (kann Tabellen-/Spaltennamen, Host-Fragmente enthalten). | Nur generische Meldung zurückgeben, Details nur `console.error`. | S | keins |
| FT-SEC-19 | `scripts/selfhost.sh:46,56,60,95-96`, `prod.sh:3`, `dev.sh:3`, `next.config.ts:30` | niedrig | (a) `next start --hostname 0.0.0.0` (selfhost.sh Plist, prod.sh): Port 3005 ist zusätzlich im LAN per HTTP erreichbar, am Funnel vorbei (kein TLS, Host-Header frei). (b) `update` nutzt `npm install` statt `npm ci` und `git pull` ungeprüft; Build und `db-sync-on-build.mjs` laufen automatisch gegen die Produktions-DB aus `.env` (migrate deploy, Fallback `db push` ohne Datenverlust-Flag, ok). (c) Kein `chmod 600 .env` (nur Existenzprüfung von `DATABASE_URL`/`AUTH_SECRET`/`AUTH_URL`, Werte werden nicht ausgegeben, gut). (d) `dev.sh`: Dev-Server auf `0.0.0.0` mit Webpack-Overlay, `allowedDevOrigins` mit fester LAN-IP. (e) Funnel wird mit `--bg --https=443` ohne Pfadeinschränkung freigegeben: alles inklusive Register/Admin-Routen. (f) `prod.sh` und `selfhost.sh` überlappen (Port 3005), prod.sh ohne `NODE_ENV`. | Bind auf `127.0.0.1` (Funnel/Serve verbindet lokal); `npm ci`; `chmod 600 .env` im Skript; `dev.sh` auf `localhost`; `prod.sh` löschen oder auf selfhost verweisen. | S | niedrig |
| FT-SEC-20 | `src/app/.well-known/*/route.ts`, `mcp/oauth/register/route.ts:203-207`, `token/route.ts:246-250`, `mcp/route.ts:48-53` | niedrig | CORS `*` auf MCP-/OAuth-Endpunkten; da Bearer-Auth (kein Cookie) und `Allow-Credentials` fehlt, ist das hier nicht ausnutzbar. Alle übrigen Routen senden **keine** CORS-Header (nur `capacitor://localhost` per nativer `CapacitorHttp`-Brücke, `native-auth-fetch-patch.tsx`, kein Origin-Check nötig). Defense in depth fehlt: kein Origin-Check bei Cookie-Auth für Mutationen (Schutz hängt an SameSite=Lax und fehlendem CORS-Preflight). | Auf Mutationen mit Cookie: `Origin`-Header gegen `AUTH_URL` prüfen (im künftigen `proxy.ts`); `register` mit `redirect_uris`-Validierung (siehe FT-SEC-02). | S | niedrig |
| FT-SEC-21 | `src/features/auth/schemas.ts:9-12` | mittel | Passwortrichtlinie: min. 8 Zeichen + 1 Großbuchstabe + 1 Ziffer, kein Max (bcrypt kürzt bei 72 Byte stillschweigend), keine Prüfung gegen Leaklisten; zu schwach für öffentlich erreichbares Login ohne Rate-Limit (FT-SEC-03). Login-Schema `min(1)` ok. | Min. 12 Zeichen, Max 72 Byte, Passwort-Blacklist (z. B. zxcvbn-light); Wortlaut in `i18n` anpassen. | S | niedrig (bestehende Konten bleiben gültig, Regel gilt nur beim Anlegen/Ändern) |
| FT-SEC-22 | Repo-Check (`git ls-files`): `.env.example` (Platzhalter, ok), `ios/debug.xcconfig` (nur `CAPACITOR_DEBUG`), `.gitignore` deckt `.env*`, `*.pem`, nicht `.claude/settings.local.json` | niedrig | Keine weiteren Secret-Muster (`AIza…`, `ftp_…`, `postgres://user:pass@`, `sk-…`) in getrackten Dateien außer FT-SEC-01. Lücke: `.gitignore` enthält keine Regel für `.claude/*.local.*`, keinen Secret-Scanner im CI. Auffällig: `tsconfig.tsbuildinfo` liegt im Verzeichnis (laut `.gitignore` ignoriert, nicht getrackt, ok). | `.claude/settings.local.json`, `*.local.json` in `.gitignore`; GitHub Secret Scanning/Push Protection aktivieren (`run_secret_scanning` oder Repo-Einstellung), pre-commit `gitleaks`. | S | keins |

Hinweis KB: Bezug zu KB-F/KB-E/KB-G (Selbsthosting): FT-SEC-03/04/11/19 betreffen genau die dort „ungetestete“ öffentliche Instanz. Verwandte Fehler gleicher Art zu KB-I (Überschreiben der Aktivkalorien) wurden hier nicht gefunden.

## Was geprüft wurde und in Ordnung ist

- **IDOR:** Alle `[id]`-/Child-Routen filtern über `userId` (direkt oder über Relation): `workouts/*` (`findFirst({ id, userId })`, Sets über `workout: { userId }`), `plans/*`, `plan-sessions/*` (`plan: { userId }`), `plan-session-exercises` (`planSession: { plan: { userId } }`), `exercises/[id]` (Schreiben nur `isCustom`, `userId`), `body-weight/[id]`, `nutrition-plan/[id]` (Eigentümer-Vergleich Zeile 52), `health/cardio/[id]`, `tokens/[id]`, `body-measurements` (`deleteMany` mit `userId`), `calendar/overrides`. Das anschließende `update/delete({ where: { id } })` erfolgt nach erfolgreicher Eigentümerprüfung (kein TOCTOU-Risiko relevanter Art). Ausnahme siehe FT-SEC-12. Raw-SQL (`$queryRaw`, 7 Stellen) nur mit Tagged-Template-Parametern und `userId`-Bindung; einziges `$queryRawUnsafe` ist `SELECT 1` (`health/route.ts:8`).
- **SSRF:** keine serverseitigen Fetches mit Nutzer-URLs gefunden (`fetch` nur im Client/Native; Chat nutzt feste Provider).
- **Zod:** an allen Mutationen mit Body außer `chat`, `mcp`, `mcp/oauth/*` und dem HAE-Pfad von `health-data` (dort feldweise `safeParse` Zeile 548-550, Arraygröße ungeprüft). GET-Parameter werden manuell begrenzt (`clampWeeks`, `limit` ≤ 100/365).
- **Native:** Token im Keychain (`kSecAttrAccessibleAfterFirstUnlock`, `NativeAuthTokenPlugin.swift:38`), `loggingBehavior: 'none'` (`capacitor.config.ts`), keine ATS-Ausnahme in `Info.plist`.
- **Service Worker:** `/api/*` network-only, Nutzer-Caches beim Abmelden geleert (`public/sw.js:4,89-106`).
- **dangerouslySetInnerHTML:** nicht verwendet.

## Routen-Tabelle (82 `route.ts`)

Auth-Mechanismus: **S/B** = `requireUserId()` → NextAuth-Session-Cookie oder `Authorization: Bearer ftp_…` (`api-auth.ts`). **S** = nur Session (`auth()`). Eigentümerprüfung: ja = userId-Filter/Relation in jeder Prisma-Abfrage; n/a = keine Mandantendaten.

| Route | Methoden | Auth | Eigentümerprüfung |
|---|---|---|---|
| `/.well-known/oauth-authorization-server` | GET | keine (öffentlich, Metadaten) | n/a |
| `/.well-known/oauth-protected-resource` | GET | keine (öffentlich, Metadaten) | n/a |
| `/api/ai/body-measurements` | GET | S/B | ja |
| `/api/ai/calendar` | GET | S/B | ja |
| `/api/ai/cardio-history` | GET | S/B | ja |
| `/api/ai/coach-context` | GET | S/B | ja |
| `/api/ai/exercise-history` | GET | S/B | ja (`findExerciseVisibleToUser`) |
| `/api/ai/exercises` | GET | S/B | ja (global + eigene) |
| `/api/ai/health` | GET | S/B | ja |
| `/api/ai/personal-records` | GET | S/B | ja |
| `/api/ai/plans` | GET | S/B | ja |
| `/api/ai/progress-report` | GET | S/B | ja |
| `/api/ai/recommendations` | GET | S/B | ja |
| `/api/ai/settings` | GET | S/B | ja |
| `/api/ai/training-summary` | GET | S/B | ja |
| `/api/ai/workouts/[id]` | GET | S/B | ja (`getWorkoutDetailData(userId, id)`) |
| `/api/ai/workouts` | GET | S/B | ja |
| `/api/auth/[...nextauth]` | GET, POST | öffentlich (NextAuth selbst) | n/a; kein Rate-Limit (FT-SEC-03) |
| `/api/auth/native-login` | POST | öffentlich (Passwort → mintet Token) | n/a; kein Rate-Limit, Enumeration (FT-SEC-03/08) |
| `/api/auth/register` | POST | öffentlich | n/a; offen, kein Limit (FT-SEC-04) |
| `/api/body-measurements` | GET, POST, DELETE | S/B | ja |
| `/api/body-weight/[id]` | PATCH, DELETE | S/B | ja |
| `/api/body-weight` | GET, POST | S/B | ja |
| `/api/calendar/overrides` | PUT, DELETE | S/B | ja (Composite-Key mit userId) |
| `/api/calendar/plan` | GET | S/B | ja |
| `/api/calendar/schedule` | GET | S/B | ja |
| `/api/cardio/live` | POST, GET | S/B | ja (`where: { userId }`) |
| `/api/cardio/live/stream` | GET | S/B | ja; SSE-Last (FT-SEC-11) |
| `/api/chat` | POST | S/B | ja (Kontext per `userId`); kein Limit/Zod (FT-SEC-09) |
| `/api/dashboard/body-weight-trend` | GET | S/B | ja |
| `/api/dashboard/client-payload` | GET | S/B | ja |
| `/api/dashboard/consistency` | GET | S/B | ja |
| `/api/dashboard/muscle-heatmap` | GET | S/B | ja |
| `/api/dashboard/progress/[exerciseId]` | GET | S/B | ja (`findExerciseVisibleToUser`) |
| `/api/dashboard/prs` | GET | S/B | ja |
| `/api/dashboard/summary` | GET | S/B | ja |
| `/api/dashboard/volume` | GET | S/B | ja (Raw-SQL mit `userId`) |
| `/api/exercises/[id]/history` | GET | S/B | ja |
| `/api/exercises/[id]` | GET, PATCH, DELETE | S/B | ja (Schreiben nur `isCustom` + `userId`) |
| `/api/exercises/most-used` | GET | S/B | ja (Raw-SQL mit `userId`) |
| `/api/exercises` | GET, POST | S/B | ja |
| `/api/export/csv` | GET | S/B | ja |
| `/api/export` | GET | S/B | ja (Vollexport per Token, Teil von FT-SEC-05) |
| `/api/health-data` | GET, POST, DELETE | S/B | ja; Health-Logging (FT-SEC-17) |
| `/api/health/cardio/[id]` | DELETE | S/B | ja |
| `/api/health/cardio` | GET | S/B | ja |
| `/api/health/recovery` | GET | S/B | ja |
| `/api/health` | GET | keine (öffentlich, `SELECT 1`) | n/a |
| `/api/mcp/oauth/authorize` | GET | Session (`auth()`), sonst Redirect `/login` | mintet Token für `session.user.id`; **kein** redirect_uri-Check (FT-SEC-02) |
| `/api/mcp/oauth/register` | POST, OPTIONS | öffentlich (RFC 7591), CORS `*` | n/a; speichert nichts (FT-SEC-02) |
| `/api/mcp/oauth/token` | POST, OPTIONS | öffentlich (Code + optionales PKCE), CORS `*` | Code entscheidet; kein Client-/Redirect-Bind (FT-SEC-02) |
| `/api/mcp` | GET, POST, OPTIONS | GET/OPTIONS öffentlich; POST: Bearer oder `?token=` (FT-SEC-06) | ja; Batch unbegrenzt (FT-SEC-09) |
| `/api/nutrition-plan/[id]` | PATCH | S/B | ja (`existing.userId !== userId`) |
| `/api/nutrition-plan/current-target` | GET | S/B | ja |
| `/api/nutrition-plan` | GET, POST | S/B | ja |
| `/api/nutrition-plan/weight-trend/calendar-weeks` | GET | S/B | ja |
| `/api/nutrition-plan/weight-trend` | GET | S/B | ja |
| `/api/plan-session-exercises/[pseId]` | PATCH, DELETE | S/B | ja (Relation `plan.userId`) |
| `/api/plan-sessions/[sessionId]/exercises/reorder` | POST | S/B | ja |
| `/api/plan-sessions/[sessionId]/exercises` | POST | S/B | ja (inkl. Sichtbarkeit der Übung) |
| `/api/plan-sessions/[sessionId]` | PATCH, DELETE | S/B | ja (auch `targetPlanId`) |
| `/api/plan-sessions/[sessionId]/start` | POST | S/B | ja |
| `/api/plans/[planId]` | GET, PATCH, DELETE | S/B | ja |
| `/api/plans/[planId]/sessions/reorder` | POST | S/B | ja |
| `/api/plans/[planId]/sessions` | POST | S/B | ja |
| `/api/plans` | GET, POST | S/B | ja |
| `/api/push-tokens` | POST, DELETE | nur Session (`auth()`) | Token global eindeutig, Umhängen (FT-SEC-13) |
| `/api/records` | GET | S/B | ja |
| `/api/settings` | GET, PATCH | S/B | ja |
| `/api/tokens/[id]` | DELETE | S/B | ja |
| `/api/tokens` | GET, POST | S/B | ja; Bearer kann Tokens erzeugen (FT-SEC-05) |
| `/api/workouts/[id]/complete` | POST | S/B | ja |
| `/api/workouts/[id]/exercises/[weId]` | PATCH, DELETE | S/B | ja (über Workout) |
| `/api/workouts/[id]/exercises/[weId]/sets` | POST | S/B | ja (über Workout) |
| `/api/workouts/[id]/exercises/reorder` | POST | S/B | ja |
| `/api/workouts/[id]/exercises` | POST | S/B | Workout ja; **`exerciseId` ungeprüft** (FT-SEC-12) |
| `/api/workouts/[id]/previous-logs` | GET | S/B | ja (Raw-SQL mit `userId`) |
| `/api/workouts/[id]/rest-timer-adjust` | PATCH | S/B | ja |
| `/api/workouts/[id]` | GET, PATCH, DELETE | S/B | ja |
| `/api/workouts/[id]/sets/[setId]` | PATCH, DELETE | S/B | ja (`workout: { userId }`) |
| `/api/workouts/previous-logs-all` | GET | S/B | ja (Raw-SQL) |
| `/api/workouts` | GET, POST | S/B | ja (`planSessionId` auf Eigentümer geprüft, sonst `null`) |

Bilanz: 82 Routen; 8 bewusst öffentlich (`nextauth`, `register`, `native-login`, `health`, `oauth/register`, `oauth/token`, `mcp` GET/OPTIONS, 2 `.well-known`), 1 nur Session (`push-tokens`), 1 Session mit Redirect (`oauth/authorize`), Rest S/B.
