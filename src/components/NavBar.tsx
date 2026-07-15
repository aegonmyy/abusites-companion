"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/study", label: "Study" },
  { href: "/past-questions", label: "Past Qs" },
  { href: "/bookmarks", label: "Bookmarks" },
  { href: "/settings", label: "Settings" },
];

export default function NavBar() {
  const pathname = usePathname();
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/streaks")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setStreak(d.currentStreak ?? 0);
      })
      .catch(() => {
        if (!cancelled) setStreak(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="font-semibold tracking-tight">
          Grinnish Local
        </Link>
        <nav className="flex items-center gap-3 text-sm overflow-x-auto">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                pathname === link.href
                  ? "font-medium underline underline-offset-4"
                  : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
              }
            >
              {link.label}
            </Link>
          ))}
          {streak !== null && streak > 0 && (
            <span
              data-testid="streak-badge"
              className="rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 px-2 py-0.5 text-xs font-medium"
            >
              {streak} day streak
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
