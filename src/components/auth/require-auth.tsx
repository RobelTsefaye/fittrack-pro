"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthGate } from "@/lib/auth/use-auth-gate";
import { ROUTES } from "@/lib/constants";

/**
 * Client-side guard for protected pages — see useAuthGate's doc comment for
 * why this exists (static export has no server to run middleware/auth() on).
 * Renders nothing while checking or redirecting, so there's no flash of
 * protected content for an unauthenticated visitor.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const state = useAuthGate();
  const router = useRouter();

  useEffect(() => {
    if (state === "unauthenticated") router.replace(ROUTES.login);
  }, [state, router]);

  if (state !== "authenticated") return null;
  return <>{children}</>;
}
