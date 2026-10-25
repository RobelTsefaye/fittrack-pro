"use client";

import Link from "@/components/app-link";
import { usePathname } from "next/navigation";
import { Dumbbell, ClipboardList, ListChecks, Settings } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";

// Training only: workouts, plans, the exercise library and settings.
const TABS = [
  { href: ROUTES.workouts,  icon: Dumbbell,      labelKey: "nav.workouts"  as const },
  { href: ROUTES.plans,     icon: ClipboardList, labelKey: "nav.plans"     as const },
  { href: ROUTES.exercises, icon: ListChecks,    labelKey: "nav.exercises" as const },
  { href: ROUTES.settings,  icon: Settings,      labelKey: "nav.settings"  as const },
] as const;

const VOLT = "#D4FF3A";
const DIM  = "#83838C";

export function BottomTabBar() {
  const pathname = usePathname();
  const { t } = useI18n();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }
  const activeIndex = TABS.findIndex((tab) => isActive(tab.href));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 lg:hidden"
      aria-label="Hauptnavigation"
    >
      {/* Gradient fade + blur — single glass surface */}
      <div
        style={{
          background: "linear-gradient(to top, rgba(7,7,8,0.97) 55%, rgba(7,7,8,0))",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          paddingTop: 10,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* Floating pill */}
        <div
          className="tab-pill relative mx-3 flex h-[58px] items-stretch overflow-hidden md:mx-auto md:max-w-lg"
          style={{
            background: "rgba(28,28,32,0.94)",
            borderRadius: 22,
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* One marker that glides to the active tab (instead of one per tab). */}
          {activeIndex >= 0 && (
            <span
              aria-hidden
              className="tab-marker"
              style={{ left: `calc(${(activeIndex + 0.5) * (100 / TABS.length)}% - 14px)`, transform: "none" }}
            />
          )}
          {TABS.map(({ href, icon: Icon, labelKey }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className="relative flex flex-1 flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60"
              >
                <Icon
                  className="tab-icon mt-1 h-[1.2rem] w-[1.2rem]"
                  style={{ color: active ? VOLT : DIM }}
                  strokeWidth={1.7}
                />
                <span
                  className="text-[0.5625rem] font-semibold leading-none tracking-[0.03em] transition-colors duration-200"
                  style={{ color: active ? VOLT : DIM }}
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
