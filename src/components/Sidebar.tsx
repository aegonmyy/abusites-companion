"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t, useLanguage } from "@/lib/i18n";
import {
  HomeIcon,
  StudyIcon,
  NotesIcon,
  PastQsIcon,
  BookmarksIcon,
  SettingsIcon,
} from "@/components/icons/NavIcons";

const LINKS = [
  { href: "/", key: "nav_home" as const, Icon: HomeIcon, testid: "sidebar-home" },
  { href: "/study", key: "nav_study" as const, Icon: StudyIcon, testid: "sidebar-study" },
  { href: "/notes", key: "nav_notes" as const, Icon: NotesIcon, testid: "sidebar-notes" },
  { href: "/past-questions", key: "nav_past_qs" as const, Icon: PastQsIcon, testid: "sidebar-past-questions" },
  { href: "/bookmarks", key: "nav_bookmarks" as const, Icon: BookmarksIcon, testid: "sidebar-bookmarks" },
  { href: "/settings", key: "nav_settings" as const, Icon: SettingsIcon, testid: "sidebar-settings" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Persistent desktop nav — the missing piece BottomTabBar.tsx/HeaderIcons.tsx
 * don't cover (both are `sm:hidden`). At desktop width (>=640px) there was
 * previously zero persistent nav: no way to reach Bookmarks/Settings except
 * typing the URL, and no way back to other sections except the Home-only
 * logo link. This mirrors BottomTabBar's floating-glass-card vocabulary
 * (`bg-white/10 border-white/10 backdrop-blur`, `rounded-3xl`) rather than
 * `.card-deep` (the flat #08111d fill used for in-page content cards) since
 * this is chrome docked over the gradient background, same category as the
 * bottom tab bar it complements — not a content panel.
 *
 * Unlike HeaderIcons (Home-only, to save phone screen space), all 6
 * destinations show on every route — desktop has no screen-space
 * constraint forcing that trade-off.
 *
 * The brand mark is folded in here rather than kept as its own fixed
 * element: the old `.app-brand` (now removed from globals.css/layout.tsx)
 * defaulted to `top:24px; left:24px` on desktop, exactly where this
 * sidebar docks, so folding it into the sidebar header avoids two
 * fixed-position elements competing for the same corner. Per product
 * decision, the logo does not render at all on mobile any more (previously
 * it moved to a top-right icon on small screens) — this sidebar, and the
 * logo inside it, exist only at `sm:` and up.
 *
 * Desktop only (`hidden sm:flex`), the inverse of the mobile components'
 * `sm:hidden`, same 640px breakpoint globals.css already uses everywhere
 * else for this split.
 */
export default function Sidebar() {
  const pathname = usePathname();
  const language = useLanguage();

  return (
    <nav
      data-testid="desktop-sidebar"
      className="fixed inset-y-4 left-4 z-50 hidden w-56 flex-col gap-1 rounded-3xl border border-white/10 bg-white/10 p-3 shadow-xl backdrop-blur sm:flex"
    >
      <Link
        href="/"
        aria-label="Abusites Companion home"
        className="mb-2 flex items-center gap-2 rounded-2xl px-2 py-2 opacity-95 transition hover:bg-white/5"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="Abusites Companion" className="h-9 w-auto" />
      </Link>
      {LINKS.map(({ href, key, Icon, testid }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            data-testid={testid}
            data-active={active ? "true" : undefined}
            className={
              "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition " +
              (active ? "bg-emerald-500/15 text-emerald-300" : "text-white/60 hover:text-white/80")
            }
          >
            <Icon />
            <span>{t(key, language)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
