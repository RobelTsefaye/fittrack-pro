"use client";

import { useSyncExternalStore } from "react";
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

/** Subscribe to the browser's online/offline status without a setState-in-
 *  effect (which React 19 flags as a cascading-render smell). Server render
 *  assumes online so the offline indicator never appears in SSR markup. */
function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** Visible only on mobile (< lg). */
export function MobileTopBar() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const title = usePageTitle();
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );

  const initials = session?.user?.name
    ?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  return (
    <header className={cn("shrink-0 lg:hidden", "safe-top-pad")}>
      {/* Top bar — fixed height. The offline state shows as an inline icon
          rather than an extra banner row on purpose: a row that inserts/
          removes here would push the whole scroll area below it up/down. On
          iOS that shift, landing between a finger-down and finger-up, made
          taps register/highlight the wrong row (see MorePage). Keeping this
          bar a constant height means connectivity changes never move content. */}
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

        {!isOnline && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6875rem] font-medium text-amber-800 dark:text-amber-200"
            aria-label={t("offline.banner")}
          >
            <WifiOff className="h-3 w-3 shrink-0" />
          </span>
        )}

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
