"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Dumbbell,
  ListChecks,
  ClipboardList,
  Scale,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME, ROUTES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-provider";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useI18n();

  const navItems = [
    { labelKey: "nav.dashboard" as const, href: ROUTES.dashboard, icon: LayoutDashboard },
    { labelKey: "nav.workouts" as const, href: ROUTES.workouts, icon: Dumbbell },
    { labelKey: "nav.plans" as const, href: ROUTES.plans, icon: ClipboardList },
    { labelKey: "nav.exercises" as const, href: ROUTES.exercises, icon: ListChecks },
    { labelKey: "nav.bodyWeight" as const, href: ROUTES.bodyWeight, icon: Scale },
    { labelKey: "nav.settings" as const, href: ROUTES.settings, icon: Settings },
  ];

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform lg:static lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <div className="flex h-14 items-center justify-between border-b px-4">
        <Link href={ROUTES.dashboard} className="text-lg font-bold tracking-tight">
          {APP_NAME}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
