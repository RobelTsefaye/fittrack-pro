"use client"; // Error boundaries must be Client Components

import { useEffect, useSyncExternalStore } from "react";
import { getMessages } from "@/lib/i18n-server";
import type { UiLocale } from "@/lib/i18n-config";
import "./globals.css";

// global-error ersetzt das Root-Layout: kein I18nProvider, keine Cookies/Auth.
// Sprache daher aus dem Browser (Server-Snapshot "en", Client wechselt nach
// der Hydration). Texte kommen trotzdem aus src/messages/{de,en}.json.
const noopSubscribe = () => () => {};
const clientLocale = (): UiLocale =>
  typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("de")
    ? "de"
    : "en";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const locale = useSyncExternalStore(noopSubscribe, clientLocale, () => "en" as UiLocale);
  const e = getMessages(locale).errorPage;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang={locale}>
      <body className="min-h-full flex flex-col">
        <div
          role="alert"
          className="mx-auto flex min-h-screen max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center"
        >
          <h1 className="text-xl font-semibold">{e.title}</h1>
          <p className="text-sm text-muted-foreground">{e.description}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              {e.retry}
            </button>
            {/* Absichtlich <a>: Das Root-Layout ist defekt, ein voller Seitenaufruf ist der sichere Weg. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-primary hover:underline"
            >
              {e.goHome}
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
