"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Dumbbell,
  Sparkles,
  ClipboardList,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";

const TABS = [
  { href: ROUTES.dashboard, icon: LayoutDashboard, labelKey: "nav.dashboard" as const },
  { href: ROUTES.workouts,  icon: Dumbbell,        labelKey: "nav.workouts"  as const },
  { href: ROUTES.coach,     icon: Sparkles,         labelKey: "nav.coachShort" as const, center: true },
  { href: ROUTES.plans,     icon: ClipboardList,    labelKey: "nav.plans"     as const },
  { href: ROUTES.exercises, icon: ListChecks,       labelKey: "nav.exercises" as const },
];

export function BottomTabBar() {
  const pathname = usePathname();
  const { t } = useI18n();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 lg:hidden"
      aria-label="Hauptnavigation"
    >
      {/* frosted glass — same treatment as iOS tab bar */}
      <div
        className="border-t border-border/50 bg-[var(--card)]/80 backdrop-blur-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex h-[49px] items-stretch">
          {TABS.map(({ href, icon: Icon, labelKey, center }) => {
            const active = isActive(href);

            if (center) {
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch
                  aria-current={active ? "page" : undefined}
                  className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1"
                >
                  {/* raised pill for the coach shortcut */}
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-2xl transition-all duration-200",
                      active
                        ? "bg-primary shadow-lg shadow-primary/30"
                        : "bg-primary/12"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-[1.125rem] w-[1.125rem] transition-colors",
                        active ? "text-primary-foreground" : "text-primary"
                      )}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-[0.5625rem] font-semibold leading-none tracking-wide",
                      active ? "text-primary" : "text-[var(--sys-label3)]"
                    )}
                  >
                    {t(labelKey)}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={href}
                href={href}
                prefetch
                aria-current={active ? "page" : undefined}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-colors duration-150 active:opacity-60"
              >
                <Icon
                  className={cn(
                    "h-[1.125rem] w-[1.125rem] transition-colors duration-150",
                    active ? "text-primary" : "text-[var(--sys-label3)]"
                  )}
                />
                <span
                  className={cn(
                    "text-[0.5625rem] font-medium leading-none",
                    active ? "text-primary font-semibold" : "text-[var(--sys-label3)]"
                  )}
                >
                  {t(labelKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
