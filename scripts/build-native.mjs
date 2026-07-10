#!/usr/bin/env node
// Produces the static export bundled into the Capacitor iOS shell — see
// project-docs/offline-first-roadmap.md Phase 2 and next.config.ts's
// `isNativeBuild` comment.
//
// `output: "export"` tries to statically render EVERY route under `app/`,
// including Route Handlers — and Next.js hard-errors on any handler that
// isn't `force-static` (no request-time data at all). None of this app's API
// routes qualify (they all read cookies/headers/Prisma per request) — nor
// should they: those routes are meant to keep living only on the normal
// Vercel deployment, called via an ABSOLUTE url from the native bundle (see
// src/lib/native/native-auth-token.ts's fetch patch), the same way
// WatchAPIProxy.swift's native Swift code already does. `middleware.ts` is
// separately incompatible with `output: "export"` outright (fails the build
// even doing nothing dynamic).
//
// So for the duration of this build only: middleware.ts, src/app/api, and
// src/app/.well-known are moved out of the source tree entirely (not
// config'd around — there's no "exclude this subtree" flag for static
// export), so `next build` only ever sees page routes. try/finally
// guarantees everything is restored even if the build itself fails —
// leaving any of this moved-aside would silently break the next normal
// `npm run build` (Vercel).
//
// The backup location has to be OUTSIDE `src/app/` entirely — renaming a
// directory to a sibling *within* `src/app/` (e.g. `api.native-build-bak`)
// does NOT hide it from the App Router, which treats every subdirectory
// there as a route segment regardless of name. That was tried first and
// produced the exact same "force-static" error, just against a URL path
// spelling out the backup folder's name instead.

import { existsSync, renameSync, mkdirSync, rmdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const TMP_DIR = ".native-build-tmp";

const MOVES = [
  { real: "middleware.ts", bak: `${TMP_DIR}/middleware.ts` },
  { real: "src/app/api", bak: `${TMP_DIR}/api` },
  { real: "src/app/.well-known", bak: `${TMP_DIR}/well-known` },
  // PWA install manifest — meaningless inside an already-native shell, and
  // (like the routes above) reads request-time data incompatible with
  // static export.
  { real: "src/app/manifest.ts", bak: `${TMP_DIR}/manifest.ts` },
];

if (existsSync(TMP_DIR)) {
  console.error(
    `${TMP_DIR} already exists — a previous build-native run may have crashed before restoring ` +
      `its contents. Resolve manually (compare its contents against src/app/ and middleware.ts) ` +
      `before retrying.`
  );
  process.exit(1);
}

mkdirSync(TMP_DIR);
const moved = MOVES.filter(({ real }) => existsSync(real));
for (const { real, bak } of moved) renameSync(real, bak);

// `process.exit()` inside a `try` skips a pending `finally` entirely (Node
// exits immediately, before any further synchronous code — including
// cleanup — gets to run) — that would leave everything stuck moved-aside on
// every single build. Capture the exit code, let `finally` restore each path
// as the try/finally unwinds normally, and only exit afterward.
let exitCode = 1;
try {
  const result = spawnSync("npx", ["next", "build"], {
    stdio: "inherit",
    env: { ...process.env, NATIVE_BUILD: "1" },
  });
  exitCode = result.status ?? 1;
} finally {
  for (const { real, bak } of moved) renameSync(bak, real);
  rmdirSync(TMP_DIR);
}
process.exit(exitCode);
