"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { registerSchema } from "../schemas";
import { registerUser } from "../actions/register";
import { useI18n } from "@/lib/i18n-provider";

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
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      confirmPassword: formData.get("confirmPassword") as string,
    };

    const parsed = registerSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      setLoading(false);
      return;
    }

    const result = await registerUser(formData);
    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Auto sign in after registration
    const signInResult = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });

    if (signInResult?.error) {
      setError(t("auth.register.signInFailed"));
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">{t("auth.register.title")}</CardTitle>
        <CardDescription>{t("auth.register.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              id="register-error"
              role="alert"
              className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">{t("auth.register.name")}</Label>
            <Input
              id="name"
              name="name"
              type="text"
              placeholder={t("auth.register.namePlaceholder")}
              required
              autoComplete="name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.register.email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.register.password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder={t("auth.register.passwordPlaceholder")}
              required
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t("auth.register.confirmPassword")}</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder={t("auth.register.confirmPlaceholder")}
              required
              autoComplete="new-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.register.submitting") : t("auth.register.submit")}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {t("auth.register.hasAccount")}{" "}
            <Link href="/login" className="text-primary underline-offset-4 hover:underline">
              {t("auth.register.signIn")}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
