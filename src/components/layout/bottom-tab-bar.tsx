"use client";

import Link from "@/components/app-link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Dumbbell,
  Sparkles,
  ClipboardList,
  MoreHorizontal,
} from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";

const TABS = [
  { href: ROUTES.dashboard, icon: LayoutDashboard, labelKey: "nav.dashboard" as const },
  { href: ROUTES.workouts,  icon: Dumbbell,        labelKey: "nav.workouts"  as const },
  { href: ROUTES.coach,     icon: Sparkles,         labelKey: "nav.coachShort" as const },
  { href: ROUTES.plans,     icon: ClipboardList,    labelKey: "nav.plans"     as const },
  { href: ROUTES.more,      icon: MoreHorizontal,   labelKey: "nav.more"      as const },
] as const;

const MORE_ROUTES = [
  ROUTES.exercises,
  ROUTES.records,
  ROUTES.bodyWeight,
  ROUTES.plateCalculator,
  ROUTES.settings,
  ROUTES.more,
];

const VOLT = "#D4FF3A";
const DIM  = "#5E5E66";

export function BottomTabBar() {
  const pathname = usePathname();
  const { t } = useI18n();

  function isActive(href: string) {
    if (href === ROUTES.more) {
      return MORE_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
    }
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30"
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
          className="mx-3 flex h-[58px] items-stretch overflow-hidden"
          style={{
            background: "rgba(28,28,32,0.94)",
            borderRadius: 22,
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {TABS.map(({ href, icon: Icon, labelKey }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className="relative flex flex-1 flex-col items-center justify-center gap-[3px] transition-opacity active:opacity-60"
              >
                {/* Active indicator bar */}
                {active && (
                  <span
                    className="absolute top-[5px] h-[3px] w-7 rounded-full"
                    style={{ background: VOLT, boxShadow: `0 0 10px ${VOLT}` }}
                  />
                )}
                <Icon
                  className="mt-1 h-[1.2rem] w-[1.2rem]"
                  style={{ color: active ? VOLT : DIM }}
                  strokeWidth={1.7}
                />
                <span
                  className="text-[0.5625rem] font-semibold leading-none tracking-[0.03em]"
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
