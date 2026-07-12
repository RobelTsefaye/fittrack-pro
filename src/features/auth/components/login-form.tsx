"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "@/components/app-link";
import { Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginSchema } from "../schemas";
import { useI18n } from "@/lib/i18n-provider";
import { APP_NAME } from "@/lib/constants";
import { Capacitor } from "@capacitor/core";
import { saveNativeAuthToken } from "@/lib/native/native-auth-token";
import { setCachedToken } from "@/lib/native/auth-token-cache";
import { saveCachedUser } from "@/lib/cached-user";

export function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      email:    formData.get("email")    as string,
      password: formData.get("password") as string,
    };

    const parsed = loginSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      setLoading(false);
      return;
    }

    // On native, the Bearer token minted below is the actual credential the
    // rest of the app checks (RequireAuth/useAuthGate — see
    // project-docs/offline-first-roadmap.md Phase 2), so it has to be the
    // thing that decides success/failure here. The cookie session is fired
    // alongside, best-effort: WKWebView's cookie jar and the native HTTP
    // bridge's cookie store don't reliably stay in sync (native-auth-fetch-
    // patch.tsx's CapacitorCookies get/setCookie round trip kept coming back
    // empty in on-device testing), so gating login on it — as the web flow
    // below does — surfaced real MissingCSRF cookie failures as a false
    // "invalid email or password" even with correct credentials.
    if (Capacitor.isNativePlatform()) {
      // Only fire this when online. next-auth's own signIn() calls
      // getProviders() first, which swallows any network failure and
      // returns null — and when that happens, signIn() does a hard
      // `window.location.href = ".../api/auth/error"` navigation (not a
      // thrown rejection, so .catch() never sees it). That URL doesn't
      // exist in the static native bundle (API routes are excluded from
      // it), so it blew away the whole SPA and stranded the user on a
      // broken page that looked like "logged out" — this is what made
      // login (and any later signIn() retry) appear broken while offline.
      if (typeof navigator === "undefined" || navigator.onLine) {
        void signIn("credentials", {
          email:    data.email,
          password: data.password,
          redirect: false,
        }).catch(() => {});
      }

      try {
        const res = await fetch("/api/auth/native-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const json = res.ok ? await res.json() : null;
        const token = json?.data?.token as string | undefined;
        if (!token) {
          setError(t("auth.login.invalidCredentials"));
          setLoading(false);
          return;
        }
        await saveNativeAuthToken(token);
        setCachedToken(token);
        // Display identity for screens where the cookie session behind
        // useSession() may be dead (see cached-user.ts).
        const user = json?.data?.user as { name?: string | null; email?: string | null } | undefined;
        if (user) saveCachedUser({ name: user.name ?? null, email: user.email ?? null });
      } catch {
        // A thrown fetch here means the server was never actually reached
        // (no network) — distinct from the `!token` branch above, which
        // means the server *was* reached and rejected the credentials.
        // Lumping both into "Invalid email or password" is misleading: it
        // tells the user their password is wrong when the real problem is
        // no connection at all.
        setError(
          typeof navigator !== "undefined" && !navigator.onLine
            ? t("auth.login.offline")
            : t("auth.login.invalidCredentials")
        );
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
      return;
    }

    const result = await signIn("credentials", {
      email:    data.email,
      password: data.password,
      redirect: false,
    });

    if (result?.error) {
      setError(t("auth.login.invalidCredentials"));
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm px-5">

      {/* App icon + title */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[18px] bg-foreground shadow-lg shadow-black/20">
          <Dumbbell className="h-8 w-8 text-background" />
        </div>
        <h1 className="text-[1.625rem] font-bold tracking-tight">{t("auth.login.title")}</h1>
        <p className="mt-1 text-sm text-[var(--sys-label2)]">{APP_NAME}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Error */}
        {error && (
          <div
            id="login-error"
            role="alert"
            className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {/* Grouped fields — iOS inset style */}
        <div className="ios-group">
          <div className="ios-row flex-col items-start gap-1.5 py-3">
            <label htmlFor="email" className="text-[0.8125rem] font-medium text-[var(--sys-label2)]">
              {t("auth.login.email")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="name@example.com"
              required
              autoComplete="email"
              aria-invalid={!!error || undefined}
              aria-describedby={error ? "login-error" : undefined}
              className="w-full bg-transparent text-[0.9375rem] text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
          </div>
          <div className="ios-row flex-col items-start gap-1.5 py-3">
            <label htmlFor="password" className="text-[0.8125rem] font-medium text-[var(--sys-label2)]">
              {t("auth.login.password")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              autoComplete="current-password"
              aria-invalid={!!error || undefined}
              aria-describedby={error ? "login-error" : undefined}
              className="w-full bg-transparent text-[0.9375rem] text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={loading}
        >
          {loading ? t("auth.login.submitting") : t("auth.login.submit")}
        </Button>

        <p className="text-center text-sm text-[var(--sys-label2)]">
          {t("auth.login.noAccount")}{" "}
          <Link href="/register" className="font-semibold text-primary hover:opacity-80">
            {t("auth.login.signUp")}
          </Link>
        </p>
      </form>
    </div>
  );
}
