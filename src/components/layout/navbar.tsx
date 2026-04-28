"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Menu, WifiOff } from "lucide-react";
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
  if (pathname.startsWith(ROUTES.bodyWeight))  return t("nav.bodyWeight");
  if (pathname.startsWith(ROUTES.settings))    return t("nav.settings");
  if (pathname.startsWith(ROUTES.coach))       return t("nav.coach");
  return "";
}

interface MobileTopBarProps {
  onMenuClick: () => void;
}

/** Visible only on mobile (< lg). Desktop shows the sidebar instead. */
export function MobileTopBar({ onMenuClick }: MobileTopBarProps) {
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
      <div className="flex h-12 items-center gap-3 border-b border-border/60 bg-card/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-card/70">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Menü öffnen"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>

        <span className="min-w-0 flex-1 text-[0.9375rem] font-semibold tracking-tight text-foreground truncate">
          {title}
        </span>

        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground text-[0.65rem] font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}

/* Legacy named export — kept for any remaining imports */
export { MobileTopBar as Navbar };
