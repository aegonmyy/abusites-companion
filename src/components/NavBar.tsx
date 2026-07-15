"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { t, useLanguage } from "@/lib/i18n";

type IconProps = { className?: string };

function HomeIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}
function StudyIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6.5A2 2 0 0 1 5 5h5a2 2 0 0 1 2 2v13a1.5 1.5 0 0 0-1.5-1.5H3Z" />
      <path d="M21 6.5A2 2 0 0 0 19 5h-5a2 2 0 0 0-2 2v13a1.5 1.5 0 0 1 1.5-1.5H21Z" />
    </svg>
  );
}
function NotesIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 3h9l4 4v14a0 0 0 0 1 0 0H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5" />
      <path d="M8.5 13h7M8.5 16.5h7" />
    </svg>
  );
}
function PastQsIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.9.4-1.4 1-1.4 2" />
      <path d="M11.5 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
function BookmarksIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 4h12v16l-6-4-6 4Z" />
    </svg>
  );
}
function SettingsIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 7 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 2.6 14 1.65 1.65 0 0 0 3 12.6H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 7a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 2.6 1.65 1.65 0 0 0 10.4 2.6h.2A2 2 0 0 1 14.6 3v.09A1.65 1.65 0 0 0 17 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 21.4 9v.2a2 2 0 0 1 0 3.8Z" />
    </svg>
  );
}

const LINKS = [
  { href: "/", key: "nav_home" as const, Icon: HomeIcon },
  { href: "/study", key: "nav_study" as const, Icon: StudyIcon },
  { href: "/notes", key: "nav_notes" as const, Icon: NotesIcon },
  { href: "/past-questions", key: "nav_past_qs" as const, Icon: PastQsIcon },
  { href: "/bookmarks", key: "nav_bookmarks" as const, Icon: BookmarksIcon },
  { href: "/settings", key: "nav_settings" as const, Icon: SettingsIcon },
];

// Desktop sidebar shows all six. On mobile the bottom bar is compressed to the
// four primary study surfaces (roomy full-label tabs at ~93px on a 375px
// screen); Bookmarks + Settings move to the mobile top header as icon buttons.
const MOBILE_TABBAR_LINKS = LINKS.filter((l) =>
  ["/", "/study", "/notes", "/past-questions"].includes(l.href),
);
const MOBILE_HEADER_LINKS = LINKS.filter((l) =>
  ["/bookmarks", "/settings"].includes(l.href),
);

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function NavBar() {
  const pathname = usePathname();
  const language = useLanguage();
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
    <>
      {/* Desktop / tablet: left sidebar */}
      <aside
        className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:sticky md:top-0 md:h-screen px-4 py-6 gap-6 border-r"
        style={{ borderColor: "var(--border)" }}
        data-testid="sidebar"
      >
        <Link href="/" className="flex items-center gap-2 px-2">
          <span
            className="inline-flex items-center justify-center rounded-xl text-white font-bold"
            style={{ width: 32, height: 32, background: "var(--primary)" }}
          >
            G
          </span>
          <span className="font-semibold tracking-tight" style={{ color: "var(--text)" }}>
            Grinnish
          </span>
        </Link>

        <nav className="flex flex-col gap-1">
          {LINKS.map(({ href, key, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={"sidebar-item" + (active ? " sidebar-item-active" : "")}
              >
                <Icon className="shrink-0" />
                <span>{t(key, language)}</span>
              </Link>
            );
          })}
        </nav>

        {streak !== null && streak > 0 && (
          <div className="mt-auto px-2">
            <span
              data-testid="streak-badge"
              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ background: "#fff2e5", color: "#c2560a" }}
            >
              🔥 {streak} {t("day_streak", language)}
            </span>
          </div>
        )}
      </aside>

      {/* Mobile: slim top brand bar */}
      <header
        className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 border-b"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
        data-testid="mobile-header"
      >
        <Link href="/" className="flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center rounded-lg text-white font-bold"
            style={{ width: 28, height: 28, background: "var(--primary)" }}
          >
            G
          </span>
          <span className="font-semibold tracking-tight" style={{ color: "var(--text)" }}>
            Grinnish
          </span>
        </Link>
        <div className="flex items-center gap-1">
          {streak !== null && streak > 0 && (
            <span
              data-testid="streak-badge-mobile"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold mr-1"
              style={{ background: "#fff2e5", color: "#c2560a" }}
            >
              🔥 {streak}
            </span>
          )}
          {MOBILE_HEADER_LINKS.map(({ href, key, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={t(key, language)}
                title={t(key, language)}
                data-testid={`header-link-${href === "/bookmarks" ? "bookmarks" : "settings"}`}
                className="inline-flex items-center justify-center rounded-lg"
                style={{
                  width: 44,
                  height: 44,
                  color: active ? "var(--primary)" : "var(--text-muted)",
                }}
              >
                <Icon />
              </Link>
            );
          })}
        </div>
      </header>

      {/* Mobile: fixed bottom nav bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch border-t"
        style={{ background: "var(--card)", borderColor: "var(--border)", paddingBottom: "env(safe-area-inset-bottom)" }}
        data-testid="bottom-nav"
      >
        {MOBILE_TABBAR_LINKS.map(({ href, key, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={"tabbar-item" + (active ? " tabbar-item-active" : "")}
            >
              <Icon />
              <span>{t(key, language)}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
