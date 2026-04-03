"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Close sidebar on route change (navigation via link)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex h-dvh max-h-dvh min-h-dvh flex-col overflow-hidden safe-top-pad">
      <div className="flex min-w-0 flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={closeSidebar} />

        {/* Backdrop overlay — uses button for guaranteed touch handling in
            iOS standalone / PWA mode where plain div onClick is unreliable */}
        {sidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-pointer touch-manipulation bg-black/50 lg:hidden"
            aria-label="Close menu"
            onClick={closeSidebar}
            onTouchEnd={(e) => {
              e.preventDefault();
              closeSidebar();
            }}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Navbar onMenuClick={() => setSidebarOpen(true)} />
          <main className="main-scroll flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-muted/40 px-3 py-4 sm:px-4 md:p-6 safe-bottom-pad">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
