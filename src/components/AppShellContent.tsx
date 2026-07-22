"use client";

import { useSidebar } from "@/lib/sidebar-context";

export default function AppShellContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div className="app-shell-content" data-sidebar-collapsed={collapsed}>
      {children}
    </div>
  );
}
