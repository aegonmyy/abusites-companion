"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t, useLanguage } from "@/lib/i18n";
import { BookmarksIcon, SettingsIcon } from "@/components/icons/NavIcons";

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
 * Styled transparent/blended rather than the earlier reference design's boxed `.nav-button`
 * chrome, which read as a contrasting dark pill against the header — scoped
 * to just these two buttons, `.nav-button` itself is untouched. Mobile
 * only, same breakpoint as BottomTabBar.
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
