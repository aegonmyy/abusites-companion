import type { Metadata } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import BottomTabBar from "@/components/BottomTabBar";
import HeaderIcons from "@/components/HeaderIcons";
import Sidebar from "@/components/Sidebar";
import ChatFAB from "@/components/ChatFAB";

export const metadata: Metadata = {
  title: "ABUsites Companion",
  description: "Offline-first study companion powered by a local Gemma model.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="app-shell">
          {/* No standalone brand mark on mobile (per product decision — the
              logo doesn't render at all below the sm breakpoint, freeing
              that top area for HeaderIcons only). Desktop shows the logo
              folded into Sidebar.tsx's header instead of a separate fixed
              element. */}
          <Sidebar />
          <HeaderIcons />
          <div className="app-shell-content">{children}</div>
          <BottomTabBar />
          <ChatFAB />
          <ServiceWorkerRegister />
        </div>
      </body>
    </html>
  );
}
