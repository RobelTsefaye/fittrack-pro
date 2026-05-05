"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { WifiOff } from "lucide-react";
import { useI18n } from "@/lib/i18n-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

/* ── Page-title lookup for the mobile top bar ───────────────────── */
function usePageTitle() {
  const pathname = usePathname();
  const { t } = useI18n();

  if (pathname === ROUTES.dashboard)           return t("nav.dashboard");
  if (pathname.startsWith(ROUTES.workouts))    return t("nav.workouts");
  if (pathname.startsWith(ROUTES.plans))       return t("nav.plans");
  if (pathname.startsWith(ROUTES.exercises))   return t("nav.exercises");
  if (pathname.startsWith(ROUTES.bodyWeight))  return "Body Tracking";
  if (pathname.startsWith(ROUTES.settings))    return t("nav.settings");
  if (pathname.startsWith(ROUTES.coach))           return t("nav.coach");
  if (pathname.startsWith(ROUTES.plateCalculator)) return t("nav.plateCalc");
  if (pathname.startsWith(ROUTES.records))         return t("nav.records");
  if (pathname === ROUTES.more)                    return t("nav.more");
  return "";
}

/** Visible only on mobile (< lg). */
export function MobileTopBar() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const [isOnline, setIsOnline] = useState(true);
  const title = usePageTitle();

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online",  on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const initials = session?.user?.name
    ?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  return (
    <header className={cn("shrink-0 lg:hidden", "safe-top-pad")}>
      {/* Offline banner */}
      {!isOnline && (
        <div className="flex items-center gap-2 bg-amber-500/15 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span>{t("offline.banner")}</span>
        </div>
      )}

      {/* Top bar */}
      <div
        className="flex h-12 items-center gap-3 px-4"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(7,7,8,0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold tracking-tight text-white">
          {title}
        </span>

        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback
            className="text-[0.65rem] font-semibold"
            style={{ background: "#26262B", color: "#D4FF3A" }}
          >
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}

/* Legacy named export — kept for any remaining imports */
export { MobileTopBar as Navbar };
