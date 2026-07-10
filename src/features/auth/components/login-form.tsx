"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginSchema } from "../schemas";
import { useI18n } from "@/lib/i18n-provider";
import { APP_NAME } from "@/lib/constants";
import { Capacitor } from "@capacitor/core";
import { saveNativeAuthToken } from "@/lib/native/native-auth-token";

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

    // Additive, native-only, best-effort: mints and stores a Bearer token
    // alongside the (unchanged) cookie session — see
    // project-docs/offline-first-roadmap.md Phase 1. Not used by anything
    // yet, so a failure here must never block the existing login flow.
    if (Capacitor.isNativePlatform()) {
      void fetch("/api/auth/native-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json?.data?.token) void saveNativeAuthToken(json.data.token);
        })
        .catch(() => {});
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
