"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthGate } from "@/lib/auth/use-auth-gate";
import { ROUTES } from "@/lib/constants";

/**
 * Client-side equivalent of middleware.ts's "authenticated user on a public
 * page (/, /login, /register) → straight to the dashboard" rule — see
 * useAuthGate's doc comment for why this has to run client-side at all.
 */
export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const state = useAuthGate();
  const router = useRouter();

  useEffect(() => {
    if (state === "authenticated") router.replace(ROUTES.dashboard);
  }, [state, router]);

  if (state === "authenticated") return null;
  return <>{children}</>;
}
