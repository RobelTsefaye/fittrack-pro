"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-dvh max-h-dvh min-h-dvh flex-col overflow-hidden safe-top-pad">
      <div className="flex min-w-0 flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            aria-hidden
            onClick={() => setSidebarOpen(false)}
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
