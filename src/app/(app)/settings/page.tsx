"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { RequireAuth } from "@/components/auth/require-auth";
import { authenticatedFetch } from "@/lib/native/native-auth-token";
import { BackButton } from "@/components/layout/back-button";
import { SettingsPageContent } from "@/features/settings/components/settings-page-content";

type InitialSettings = {
  locale: "EN" | "DE";
  weightUnit: "KG" | "LB";
  theme: "LIGHT" | "DARK" | "SYSTEM";
  restTimerDefault: number;
};

const DEFAULT_SETTINGS: InitialSettings = {
  locale: "EN",
  weightUnit: "KG",
  theme: "SYSTEM",
  restTimerDefault: 90,
};

export default function SettingsPage() {
  const { data: session } = useSession();
  const [initial, setInitial] = useState<InitialSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    void authenticatedFetch("/api/settings", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.data) setInitial(json.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RequireAuth>
      <BackButton />
      <SettingsPageContent
        name={session?.user?.name}
        email={session?.user?.email}
        initial={initial}
      />
    </RequireAuth>
  );
}
