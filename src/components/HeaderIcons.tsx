"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t, useLanguage } from "@/lib/i18n";

type IconProps = { className?: string };

function BookmarksIcon({ className }: IconProps) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 4h12v16l-6-4-6 4Z" />
    </svg>
  );
}
function SettingsIcon({ className }: IconProps) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const LINKS = [
  { href: "/bookmarks", key: "nav_bookmarks" as const, Icon: BookmarksIcon, testid: "header-icon-bookmarks" },
  { href: "/settings", key: "nav_settings" as const, Icon: SettingsIcon, testid: "header-icon-settings" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Bookmarks + Settings were previously reachable only via a dashboard card,
 * one tap deep. They now live as small persistent icon buttons near the
 * brand mark, Home-only (every other route reaches them via the bottom tab
 * bar / dashboard content, so keeping them everywhere was redundant chrome).
 * Styled transparent/blended rather than Grinnish's boxed `.nav-button`
 * chrome, which read as a contrasting dark pill against the header — scoped
 * to just these two buttons, `.nav-button` itself is untouched. Mobile
 * only, same breakpoint as BottomTabBar and `.app-brand`.
 */
export default function HeaderIcons() {
  const pathname = usePathname();
  const language = useLanguage();

  if (pathname !== "/") return null;

  return (
    <div data-testid="header-icons" className="fixed top-3 right-3 z-50 flex items-center gap-2 sm:hidden">
      {LINKS.map(({ href, key, Icon, testid }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            aria-label={t(key, language)}
            title={t(key, language)}
            data-testid={testid}
            data-active={active ? "true" : undefined}
            className={
              "inline-flex h-11 w-11 items-center justify-center rounded-full bg-transparent transition-colors hover:bg-white/5 " +
              (active ? "text-emerald-300" : "text-white/80")
            }
          >
            <Icon />
          </Link>
        );
      })}
    </div>
  );
}
