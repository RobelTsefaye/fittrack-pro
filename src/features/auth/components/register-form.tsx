"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { registerSchema } from "../schemas";
import { useI18n } from "@/lib/i18n-provider";
import { APP_NAME } from "@/lib/constants";
import { Capacitor } from "@capacitor/core";
import { saveNativeAuthToken } from "@/lib/native/native-auth-token";

export function RegisterForm() {
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
      name:            formData.get("name")            as string,
      email:           formData.get("email")           as string,
      password:        formData.get("password")        as string,
      confirmPassword: formData.get("confirmPassword") as string,
    };

    const parsed = registerSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      setLoading(false);
      return;
    }

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setError(json?.error ?? t("auth.register.signInFailed"));
      setLoading(false);
      return;
    }

    const signInResult = await signIn("credentials", {
      email:    data.email,
      password: data.password,
      redirect: false,
    });
    if (signInResult?.error) {
      setError(t("auth.register.signInFailed"));
      setLoading(false);
      return;
    }

    // Additive, native-only, best-effort — same reasoning as login-form.tsx's
    // Phase 1 wiring: a fresh registration should also leave a Bearer token
    // stored for the native shell, not just the cookie session.
    if (Capacitor.isNativePlatform()) {
      void fetch("/api/auth/native-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
        .then((r) => (r.ok ? r.json() : null))
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

      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[18px] bg-foreground shadow-lg shadow-black/20">
          <Dumbbell className="h-8 w-8 text-background" />
        </div>
        <h1 className="text-[1.625rem] font-bold tracking-tight">{t("auth.register.title")}</h1>
        <p className="mt-1 text-sm text-[var(--sys-label2)]">{APP_NAME}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            id="register-error"
            role="alert"
            className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <div className="ios-group">
          <div className="ios-row flex-col items-start gap-1.5 py-3">
            <label htmlFor="name" className="text-[0.8125rem] font-medium text-[var(--sys-label2)]">
              {t("auth.register.name")}
            </label>
            <input
              id="name" name="name" type="text"
              placeholder={t("auth.register.namePlaceholder")}
              required autoComplete="name"
              className="w-full bg-transparent text-[0.9375rem] text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
          </div>
          <div className="ios-row flex-col items-start gap-1.5 py-3">
            <label htmlFor="email" className="text-[0.8125rem] font-medium text-[var(--sys-label2)]">
              {t("auth.register.email")}
            </label>
            <input
              id="email" name="email" type="email"
              placeholder="name@example.com"
              required autoComplete="email"
              className="w-full bg-transparent text-[0.9375rem] text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
          </div>
          <div className="ios-row flex-col items-start gap-1.5 py-3">
            <label htmlFor="password" className="text-[0.8125rem] font-medium text-[var(--sys-label2)]">
              {t("auth.register.password")}
            </label>
            <input
              id="password" name="password" type="password"
              placeholder="••••••••"
              required autoComplete="new-password"
              className="w-full bg-transparent text-[0.9375rem] text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
          </div>
          <div className="ios-row flex-col items-start gap-1.5 py-3">
            <label htmlFor="confirmPassword" className="text-[0.8125rem] font-medium text-[var(--sys-label2)]">
              {t("auth.register.confirmPassword")}
            </label>
            <input
              id="confirmPassword" name="confirmPassword" type="password"
              placeholder="••••••••"
              required autoComplete="new-password"
              className="w-full bg-transparent text-[0.9375rem] text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
          </div>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? t("auth.register.submitting") : t("auth.register.submit")}
        </Button>

        <p className="text-center text-sm text-[var(--sys-label2)]">
          {t("auth.register.hasAccount")}{" "}
          <Link href="/login" className="font-semibold text-primary hover:opacity-80">
            {t("auth.register.signIn")}
          </Link>
        </p>
      </form>
    </div>
  );
}
