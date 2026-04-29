"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Dumbbell,
  ListChecks,
  ClipboardList,
  Scale,
  Settings,
  Sparkles,
  Calculator,
  X,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME, ROUTES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

const mainNav = [
  { labelKey: "nav.dashboard"  as const, href: ROUTES.dashboard,  icon: LayoutDashboard },
  { labelKey: "nav.workouts"   as const, href: ROUTES.workouts,   icon: Dumbbell },
  { labelKey: "nav.plans"      as const, href: ROUTES.plans,      icon: ClipboardList },
  { labelKey: "nav.exercises"  as const, href: ROUTES.exercises,  icon: ListChecks },
  { labelKey: "nav.bodyWeight" as const, href: ROUTES.bodyWeight, icon: Scale },
  { labelKey: "nav.coach"      as const, href: ROUTES.coach,      icon: Sparkles },
];

const toolsNav = [
  { labelKey: "nav.plateCalc" as const, href: ROUTES.plateCalculator, icon: Calculator },
];

const accountNav = [
  { labelKey: "nav.settings" as const, href: ROUTES.settings, icon: Settings },
];

function NavItem({
  href,
  icon: Icon,
  label,
  isActive,
  onClick,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      prefetch
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8125rem] font-medium leading-none transition-all duration-150",
        isActive
          ? "bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]"
          : "text-sidebar-foreground/70 hover:bg-[var(--nav-hover-bg)] hover:text-sidebar-foreground"
      )}
    >
      <Icon
        className={cn(
          "h-[1.05rem] w-[1.05rem] shrink-0 transition-colors",
          isActive ? "text-primary opacity-100" : "opacity-60 group-hover:opacity-80"
        )}
      />
      {label}
    </Link>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { data: session } = useSession();

  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "?";

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside
      className={cn(
        /* base */
        "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-sidebar-border",
        /* frosted glass — applied via class so backdrop-filter only renders when sidebar is visible */
        "sidebar-glass",
        /* safe area on notched phones */
        "safe-x-pad safe-top-offset",
        /* mobile: slide in/out */
        "transition-transform duration-300 [transition-timing-function:var(--ease-drawer)]",
        open ? "translate-x-0" : "-translate-x-full",
        /* desktop: always visible, no shadow */
        "lg:translate-x-0 lg:shadow-none lg:static lg:inset-y-auto lg:z-auto"
      )}
    >
      {/* ── Header ──────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center justify-between px-4 safe-top-pad lg:safe-top-pad">
        <Link
          href={ROUTES.dashboard}
          prefetch
          onClick={onClose}
          className="flex items-center gap-2 group"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary shadow-sm transition-opacity group-hover:opacity-80">
            <Dumbbell className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="text-[0.9375rem] font-semibold tracking-tight text-sidebar-foreground">
            {APP_NAME}
          </span>
        </Link>

        {/* Close button — mobile only */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Menü schließen"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/50 transition-colors hover:bg-[var(--nav-hover-bg)] hover:text-sidebar-foreground lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Navigation ──────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-2 safe-bottom-inset space-y-5">

        {/* Main section */}
        <div className="space-y-0.5">
          <p className="mb-1.5 px-2.5 text-[0.65rem] font-semibold uppercase tracking-widest text-sidebar-foreground/35 select-none">
            {t("nav.sectionTraining")}
          </p>
          {mainNav.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={t(item.labelKey)}
              isActive={isActive(item.href)}
              onClick={onClose}
            />
          ))}
        </div>

        {/* Tools section */}
        <div className="space-y-0.5">
          <p className="mb-1.5 px-2.5 text-[0.65rem] font-semibold uppercase tracking-widest text-sidebar-foreground/35 select-none">
            {t("nav.sectionTools")}
          </p>
          {toolsNav.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={t(item.labelKey)}
              isActive={isActive(item.href)}
              onClick={onClose}
            />
          ))}
        </div>

        {/* Account section */}
        <div className="space-y-0.5">
          <p className="mb-1.5 px-2.5 text-[0.65rem] font-semibold uppercase tracking-widest text-sidebar-foreground/35 select-none">
            {t("nav.sectionAccount")}
          </p>
          {accountNav.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={t(item.labelKey)}
              isActive={isActive(item.href)}
              onClick={onClose}
            />
          ))}
        </div>
      </nav>

      {/* ── User profile ────────────────────────────── */}
      <div className="shrink-0 border-t border-sidebar-border px-2.5 py-3">
        <button
          type="button"
          onClick={() => {
            onClose?.();
            router.push(ROUTES.settings);
          }}
          className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-[var(--nav-hover-bg)]"
        >
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-[0.6rem] font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8rem] font-medium leading-tight text-sidebar-foreground">
              {session?.user?.name ?? "—"}
            </p>
            <p className="truncate text-[0.7rem] leading-tight text-sidebar-foreground/50">
              {session?.user?.email ?? ""}
            </p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/30 transition-transform group-hover:translate-x-0.5" />
        </button>

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-[0.78rem] text-sidebar-foreground/50 transition-colors hover:bg-[var(--nav-hover-bg)] hover:text-destructive"
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          {t("navbar.signOut")}
        </button>
      </div>
    </aside>
  );
}
