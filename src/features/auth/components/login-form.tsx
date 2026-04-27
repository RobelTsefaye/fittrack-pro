"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loginSchema } from "../schemas";
import { useI18n } from "@/lib/i18n-provider";

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
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    };

    const parsed = loginSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      setLoading(false);
      return;
    }

    const result = await signIn("credentials", {
      email: data.email,
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
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">{t("auth.login.title")}</CardTitle>
        <CardDescription>{t("auth.login.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              id="login-error"
              role="alert"
              className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.login.email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              autoComplete="email"
              aria-invalid={!!error || undefined}
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.login.password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder={t("auth.login.passwordPlaceholder")}
              required
              autoComplete="current-password"
              aria-invalid={!!error || undefined}
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.login.submitting") : t("auth.login.submit")}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {t("auth.login.noAccount")}{" "}
            <Link href="/register" className="text-primary underline-offset-4 hover:underline">
              {t("auth.login.signUp")}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
