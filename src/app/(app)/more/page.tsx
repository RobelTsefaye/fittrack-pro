"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useSession } from "next-auth/react";
import {
  ListChecks,
  Trophy,
  Scale,
  Calculator,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const ITEMS = [
  { href: ROUTES.exercises,       icon: ListChecks,  labelKey: "nav.exercises"  as const },
  { href: ROUTES.records,         icon: Trophy,      labelKey: "nav.records"    as const },
  { href: ROUTES.bodyWeight,      icon: Scale,       labelKey: "nav.bodyWeight" as const },
  { href: ROUTES.plateCalculator, icon: Calculator,  labelKey: "nav.plateCalc"  as const },
  { href: ROUTES.settings,        icon: Settings,    labelKey: "nav.settings"   as const },
];

export default function MorePage() {
  const { t } = useI18n();
  const { data: session } = useSession();

  const initials =
    session?.user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "?";

  return (
    <div className="space-y-4">
      <h1 className="page-title">{t("nav.more")}</h1>

      {/* User profile */}
      <div
        className="flex items-center gap-3 rounded-[16px] p-4"
        style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <Avatar className="h-11 w-11 shrink-0">
          <AvatarFallback
            className="text-[0.7rem] font-semibold"
            style={{ background: "#26262B", color: "#D4FF3A" }}
          >
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9375rem] font-semibold text-white">
            {session?.user?.name ?? "—"}
          </p>
          <p className="truncate text-[0.8125rem]" style={{ color: "#9A9AA2" }}>
            {session?.user?.email ?? ""}
          </p>
        </div>
      </div>

      {/* Nav items */}
      <div
        className="overflow-hidden rounded-[16px]"
        style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {ITEMS.map(({ href, icon: Icon, labelKey }, i) => (
          <Link
            key={href}
            href={href}
            prefetch
            className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-white/5"
            style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.08)" : "none" }}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <Icon className="h-[18px] w-[18px]" style={{ color: "#9A9AA2" }} strokeWidth={1.7} />
            </div>
            <span className="flex-1 text-[0.9375rem] font-medium text-white">
              {t(labelKey)}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "#5E5E66" }} />
          </Link>
        ))}
      </div>

      {/* Sign out */}
      <div
        className="overflow-hidden rounded-[16px]"
        style={{ background: "#121214", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-3.5 transition-colors active:bg-white/5"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <LogOut className="h-[18px] w-[18px]" style={{ color: "#9A9AA2" }} strokeWidth={1.7} />
          </div>
          <span className="flex-1 text-left text-[0.9375rem] font-medium" style={{ color: "#FF453A" }}>
            {t("navbar.signOut")}
          </span>
        </button>
      </div>
    </div>
  );
}
