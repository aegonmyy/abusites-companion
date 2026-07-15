import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      {/* min-h-screen, not h-full: h-full on html/body with no percentage
          height chain above them collapses to zero (see brief's known bug
          class), min-h-screen is viewport-relative and can't collapse. */}
      <body className="min-h-screen flex flex-col">
        <NavBar />
        <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6">
          {children}
        </main>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
