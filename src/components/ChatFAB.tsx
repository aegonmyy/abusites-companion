"use client";

import Link from "next/link";
import { ChatIcon } from "@/components/icons/NavIcons";

/**
 * Mobile-only entry point to the freeform /chat page. Deliberately NOT a
 * fifth item on BottomTabBar.tsx (that bar's 4 items are an existing,
 * deliberate set) and NOT part of HeaderIcons.tsx (top-right, Home-route
 * only). A separate floating round button in the one corner nothing else
 * occupies: bottom-right, above the bottom tab bar. Desktop already has
 * this route in Sidebar.tsx, so this hides at `sm:` and up.
 */
export default function ChatFAB() {
  return (
    <Link
      href="/chat"
      aria-label="Open chat"
      title="Chat"
      data-testid="chat-fab"
      className="fixed bottom-24 right-4 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-emerald-500 text-white shadow-xl transition hover:bg-emerald-400 sm:hidden"
    >
      <ChatIcon className="h-6 w-6" />
    </Link>
  );
}
