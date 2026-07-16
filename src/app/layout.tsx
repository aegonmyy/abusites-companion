import type { Metadata } from "next";
import "./globals.css";
import AppLogo from "@/components/AppLogo";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import BottomTabBar from "@/components/BottomTabBar";
import HeaderIcons from "@/components/HeaderIcons";

export const metadata: Metadata = {
  title: "Grinnish Local",
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
          <div className="app-brand">
            <AppLogo />
          </div>
          <HeaderIcons />
          <div className="app-shell-content">{children}</div>
          <BottomTabBar />
          <ServiceWorkerRegister />
        </div>
      </body>
    </html>
  );
}
