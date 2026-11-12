import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Auth-Abdeckung aller `src/app/api/** /route.ts`.
 *
 * Hintergrund: `middleware.ts` lässt `/api/*` ungeprüft durch (`NextResponse.next()`),
 * d. h. die Authentifizierung hängt ausschliesslich an jeder einzelnen Route.
 * Dieser Test erkennt pro exportierter HTTP-Methode statisch (Quelltext-Scan), ob im
 * Handler ein Auth-Muster vorkommt (`requireUserId`, `resolveUserIdForDataApi`,
 * `resolveUserIdBySecret`, `auth()`), oder ob die Route in der expliziten ALLOWLIST steht.
 *
 * Grenze: Das ist ein Textscan, keine Laufzeitprüfung. Er belegt, dass ein Auth-Aufruf im
 * Handlertext steht, nicht dass er auf jedem Pfad vor dem Datenzugriff greift.
 */

const API_DIR = join(process.cwd(), "src", "app", "api");
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
type Method = (typeof HTTP_METHODS)[number];

/** Muster, die als Authentifizierung zählen. */
const AUTH_PATTERNS: RegExp[] = [
  /\brequireUserId\s*\(/,
  /\brequireUser\s*\(/,
  /\bresolveUserIdForDataApi\s*\(/,
  /\bresolveUserIdBySecret\s*\(/,
  /\bauth\s*\(\s*\)/,
];

/**
 * Bewusst öffentliche Routen/Methoden. Schlüssel: "<route-pfad relativ zu src/app/api> <METHODE>"
 * oder "<route-pfad> *" für alle Methoden. Jeder Eintrag braucht eine Begründung.
 */
const ALLOWLIST: Record<string, string> = {
  "auth/[...nextauth]/route.ts *":
    "NextAuth-Handler (Login/Callback/Session); Auth ist der Zweck der Route selbst.",
  "auth/register/route.ts POST": "Registrierung eines neuen Kontos; muss anonym erreichbar sein.",
  "auth/native-login/route.ts POST":
    "Passwort-Login für die native App, prüft bcrypt-Hash selbst und mintet dann einen API-Token.",
  "health/route.ts GET":
    "Liveness/DB-Check (SELECT 1) ohne Nutzerdaten, für Monitoring/Deploy-Checks.",
  "mcp/oauth/register/route.ts *":
    "OAuth Dynamic Client Registration (RFC 7591) für den MCP-Connector; per Spec anonym.",
  "mcp/oauth/token/route.ts *":
    "OAuth Token-Endpoint; Authentifizierung läuft über den verschlüsselten Code + PKCE statt Session.",
  "mcp/route.ts OPTIONS": "CORS-Preflight ohne Daten.",
  "mcp/route.ts GET":
    "Server-Info/Discovery (Name, Version, Toolnamen) ohne Nutzerdaten; POST ist geschützt.",
};

/**
 * Routen ohne eindeutig erkennbare Auth, die nicht klar öffentlich sind.
 * Aktuell leer: alle nicht-öffentlichen Routen haben ein Auth-Muster. Neue unklare Fälle
 * hier eintragen (Finding-Kandidaten) statt stillschweigend in die ALLOWLIST.
 */
const UNKLAR: Record<string, string> = {};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name === "route.ts") out.push(full);
  }
  return out.sort();
}

type Handler = { method: Method; body: string; line: number };

/** Zerlegt eine route.ts in exportierte Methoden samt Quelltext bis zum nächsten Export. */
function extractHandlers(src: string): Handler[] {
  const lines = src.split("\n");
  const exportLines = lines
    .map((text, i) => ({ text, i }))
    .filter(({ text }) => /^export\s/.test(text));
  const handlers: Handler[] = [];
  exportLines.forEach(({ text, i }, idx) => {
    const end = idx + 1 < exportLines.length ? exportLines[idx + 1].i : lines.length;
    const body = lines.slice(i, end).join("\n");
    // export const GET = ... | export async function GET | export function GET
    const single = text.match(
      /^export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/
    );
    if (single) {
      handlers.push({ method: single[1] as Method, body, line: i + 1 });
      return;
    }
    // export const { GET, POST } = handlers;
    const destructured = text.match(/^export\s+const\s*\{([^}]*)\}/);
    if (destructured) {
      for (const m of destructured[1].split(",").map((s) => s.trim())) {
        if ((HTTP_METHODS as readonly string[]).includes(m)) {
          handlers.push({ method: m as Method, body, line: i + 1 });
        }
      }
    }
  });
  return handlers;
}

function isAllowed(route: string, method: Method): string | undefined {
  return ALLOWLIST[`${route} ${method}`] ?? ALLOWLIST[`${route} *`];
}

const files = walk(API_DIR);
const routes = files.map((file) => {
  const route = relative(API_DIR, file).split(sep).join("/");
  const src = readFileSync(file, "utf8");
  return { route, file, handlers: extractHandlers(src) };
});

describe("API-Routen: Auth-Abdeckung", () => {
  it("findet die erwarteten Routen (Guard gegen kaputten Scan)", () => {
    expect(routes.length).toBeGreaterThanOrEqual(80);
    expect(routes.every((r) => r.handlers.length > 0)).toBe(true);
  });

  const unprotected: string[] = [];
  const unklar: string[] = [];
  for (const { route, handlers } of routes) {
    for (const h of handlers) {
      const key = `${route} ${h.method}`;
      const hasAuth = AUTH_PATTERNS.some((p) => p.test(h.body));
      if (isAllowed(route, h.method)) continue;
      if (hasAuth) continue;
      if (UNKLAR[key]) unklar.push(`${key} (route.ts:${h.line}): ${UNKLAR[key]}`);
      else unprotected.push(`${key} (route.ts:${h.line})`);
    }
  }

  it("jede Methode nutzt ein Auth-Muster oder steht in der ALLOWLIST", () => {
    expect(
      unprotected,
      `Ohne Auth und nicht in ALLOWLIST/UNKLAR:\n${unprotected.join("\n")}`
    ).toEqual([]);
  });

  it("jede ALLOWLIST-Eintrag verweist auf eine existierende Route (keine Karteileichen)", () => {
    const known = new Set(routes.map((r) => r.route));
    for (const key of Object.keys(ALLOWLIST)) {
      expect(known.has(key.replace(/ (\*|[A-Z]+)$/, "")), key).toBe(true);
    }
  });

  it("ALLOWLIST-Einträge haben eine Begründung", () => {
    for (const [key, reason] of Object.entries(ALLOWLIST)) {
      expect(reason.length, key).toBeGreaterThan(10);
    }
  });

  it("ALLOWLIST enthält keine Methode, die inzwischen Auth hat (Liste aktuell halten)", () => {
    const stale: string[] = [];
    for (const { route, handlers } of routes) {
      for (const h of handlers) {
        if (ALLOWLIST[`${route} ${h.method}`] && AUTH_PATTERNS.some((p) => p.test(h.body))) {
          stale.push(`${route} ${h.method}`);
        }
      }
    }
    // IST: mcp/route.ts GET nutzt kein Auth-Muster; `auth/native-login` erwähnt
    // resolveUserIdForDataApi nur im Kommentar und steht deshalb zu Recht in der Allowlist.
    expect(stale).toEqual([]);
  });

  if (Object.keys(UNKLAR).length > 0) {
    console.warn(`[route-auth-coverage] UNKLAR:\n${Object.keys(UNKLAR).join("\n")}`);
  }
  it("UNKLAR ist leer (Routen ohne erkennbare Auth, nicht eindeutig öffentlich, klären)", () => {
    expect(Object.keys(UNKLAR)).toEqual([]);
  });

  it("alle datenführenden Routen sind per withApi gewrappt oder prüfen die Session selbst", () => {
    // Characterization: Routen ohne withApi, die trotzdem Auth haben, sind bekannt/erlaubt.
    const withoutWithApi: string[] = [];
    for (const { route, handlers } of routes) {
      for (const h of handlers) {
        if (isAllowed(route, h.method)) continue;
        if (!/\bwithApi\s*\(/.test(h.body)) withoutWithApi.push(`${route} ${h.method}`);
      }
    }
    expect(withoutWithApi.sort()).toEqual(
      [
        "chat/route.ts POST",
        "push-tokens/route.ts DELETE",
        "push-tokens/route.ts POST",
        "mcp/route.ts POST",
        "mcp/oauth/authorize/route.ts GET",
      ].sort()
    );
  });
});

describe("Sicherheits-Beobachtungen (IST, vermutlich Findings)", () => {
  const read = (p: string) => readFileSync(join(API_DIR, p), "utf8");

  it("IST: /api/mcp/oauth/authorize validiert redirect_uri nicht gegen registrierte Clients", () => {
    const src = read("mcp/oauth/authorize/route.ts");
    // Die Registrierung (register/route.ts) speichert redirect_uris nirgends,
    // authorize leitet an jede übergebene redirect_uri weiter.
    expect(src).toMatch(/new URL\(redirectUri\)/);
    expect(src).not.toMatch(/redirect_uris|allowedRedirect|registeredClient/);
  });

  it("IST: Authorization-Code ist zustandslos (nicht einmalig einlösbar) und PKCE optional", () => {
    const src = read("mcp/oauth/token/route.ts");
    expect(src).toMatch(/if \(cc\)/); // PKCE nur wenn beim Authorize mitgegeben
    expect(src).not.toMatch(/prisma/); // kein Verbrauchs-Marker in der DB
  });
});
