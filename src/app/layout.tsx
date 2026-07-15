import type { Metadata } from "next";
import "./globals.css";

import NavBar from "@/components/NavBar";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

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
      {/* min-h-screen, not h-full: h-full on html/body with no percentage
          height chain above them collapses to zero (see brief's known bug
          class), min-h-screen is viewport-relative and can't collapse.
          Shell is a column on mobile (top bar + content + fixed bottom nav)
          and a row on md+ (left sidebar + content). */}
      <body className="app-shell flex flex-col md:flex-row">
        <NavBar />
        <div className="flex-1 min-w-0 flex flex-col">
          <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 pb-24 md:pb-10">
            {children}
          </main>
        </div>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
