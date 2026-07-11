"use client";

import Link from "@/components/app-link";
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
  Trophy,
  X,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME, ROUTES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n-provider";
import { clearSwCache } from "@/components/pwa-register";
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
  { labelKey: "nav.records"    as const, href: ROUTES.records,    icon: Trophy },
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
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.8125rem] font-medium leading-none transition-all duration-150",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-sidebar-foreground/65 hover:bg-sidebar-foreground/6 hover:text-sidebar-foreground"
      )}
    >
      {/* Active indicator pill */}
      {isActive && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
      )}
      <Icon
        className={cn(
          "h-[1.05rem] w-[1.05rem] shrink-0 transition-colors",
          isActive ? "text-primary" : "opacity-55 group-hover:opacity-80"
        )}
      />
      {label}
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="mb-1 px-3 text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-sidebar-foreground/30 select-none">
      {label}
    </p>
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
        "fixed inset-y-0 left-0 z-50 flex w-[15.5rem] flex-col",
        /* border + subtle background */
        "border-r border-sidebar-border/60 bg-sidebar",
        /* mobile: slide in/out */
        "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        open ? "translate-x-0" : "-translate-x-full",
        /* desktop: always visible, no transform */
        "lg:translate-x-0 lg:shadow-none lg:static lg:inset-y-auto lg:z-auto"
      )}
    >
      {/* ── Header — only one safe-area applied here via padding ────── */}
      <div
        className="flex h-14 shrink-0 items-center justify-between px-4 lg:h-14"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <Link
          href={ROUTES.dashboard}
          onClick={onClose}
          className="flex items-center gap-2.5 group"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-primary shadow-sm ring-1 ring-primary/20 transition-opacity group-hover:opacity-80">
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
          className="flex h-8 w-8 items-center justify-center rounded-xl text-sidebar-foreground/40 transition-colors hover:bg-sidebar-foreground/8 hover:text-sidebar-foreground lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Divider ─────────────────────────────────────────────────── */}
      <div className="mx-4 h-px bg-sidebar-border/50" />

      {/* ── Navigation ──────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">

        {/* Main section */}
        <div className="space-y-0.5">
          <SectionLabel label={t("nav.sectionTraining")} />
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
          <SectionLabel label={t("nav.sectionTools")} />
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
          <SectionLabel label={t("nav.sectionAccount")} />
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

      {/* ── Divider ─────────────────────────────────────────────────── */}
      <div className="mx-4 h-px bg-sidebar-border/50" />

      {/* ── User profile ────────────────────────────────────────────── */}
      <div className="shrink-0 px-2.5 py-3">
        <button
          type="button"
          onClick={() => {
            onClose?.();
            router.push(ROUTES.settings);
          }}
          className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors duration-150 hover:bg-sidebar-foreground/6"
        >
          <Avatar className="h-8 w-8 shrink-0 ring-2 ring-primary/20">
            <AvatarFallback className="bg-primary text-primary-foreground text-[0.6rem] font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8rem] font-semibold leading-tight text-sidebar-foreground">
              {session?.user?.name ?? "—"}
            </p>
            <p className="truncate text-[0.7rem] leading-tight text-sidebar-foreground/45">
              {session?.user?.email ?? ""}
            </p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/25 transition-transform group-hover:translate-x-0.5" />
        </button>

        <button
          type="button"
          onClick={async () => { await clearSwCache(); signOut({ callbackUrl: "/login" }); }}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[0.78rem] font-medium text-sidebar-foreground/45 transition-colors hover:bg-destructive/8 hover:text-destructive"
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          {t("navbar.signOut")}
        </button>
      </div>
    </aside>
  );
}
