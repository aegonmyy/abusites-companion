"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  StudyIcon,
  NotesIcon,
  PastQsIcon,
  BookmarksIcon,
  ChatIcon,
  SettingsIcon,
  BackIcon,
} from "@/components/icons/NavIcons";
import { useSidebar } from "@/lib/sidebar-context";

const LINKS = [
  { href: "/", label: "Home", Icon: HomeIcon, testid: "sidebar-home" },
  { href: "/study", label: "Study", Icon: StudyIcon, testid: "sidebar-study" },
  { href: "/notes", label: "Notes", Icon: NotesIcon, testid: "sidebar-notes" },
  { href: "/past-questions", label: "Past Qs", Icon: PastQsIcon, testid: "sidebar-past-questions" },
  { href: "/bookmarks", label: "Bookmarks", Icon: BookmarksIcon, testid: "sidebar-bookmarks" },
  { href: "/chat", label: "Chat", Icon: ChatIcon, testid: "sidebar-chat" },
  { href: "/settings", label: "Settings", Icon: SettingsIcon, testid: "sidebar-settings" },
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
 * Collapsible: state lives in SidebarProvider (layout.tsx), persisted to
 * localStorage, shared with AppShellContent so collapsing this frees the
 * width straight back to whatever page is in focus (e.g. Study mode) rather
 * than leaving it as dead space — see globals.css's
 * `.app-shell-content[data-sidebar-collapsed="true"]` rule.
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
  const { collapsed, toggle } = useSidebar();

  return (
    <nav
      data-testid="desktop-sidebar"
      data-collapsed={collapsed}
      className={
        "fixed inset-y-4 left-4 z-50 hidden flex-col gap-1 rounded-3xl border border-white/10 bg-white/10 p-3 shadow-xl backdrop-blur transition-[width] duration-200 sm:flex " +
        (collapsed ? "w-16" : "w-56")
      }
    >
      <Link
        href="/"
        aria-label="ABUsites Companion home"
        className="mb-2 flex items-center gap-2 rounded-2xl px-2 py-2 opacity-95 transition hover:bg-white/5"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="ABUsites Companion" className="h-9 w-9 shrink-0" />
      </Link>
      {LINKS.map(({ href, label, Icon, testid }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            data-testid={testid}
            data-active={active ? "true" : undefined}
            title={collapsed ? label : undefined}
            className={
              "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition " +
              (collapsed ? "justify-center" : "") +
              " " +
              (active ? "bg-emerald-500/15 text-emerald-300" : "text-white/60 hover:text-white/80")
            }
          >
            <Icon className="shrink-0" />
            {!collapsed && <span>{label}</span>}
          </Link>
        );
      })}

      <button
        type="button"
        onClick={toggle}
        data-testid="sidebar-collapse-toggle"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={
          "mt-auto flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-white/50 transition hover:bg-white/5 hover:text-white/80 " +
          (collapsed ? "justify-center" : "")
        }
      >
        <span
          className="flex shrink-0 transition-transform duration-200"
          style={{ transform: collapsed ? "rotate(180deg)" : "none" }}
        >
          <BackIcon />
        </span>
        {!collapsed && <span>Collapse</span>}
      </button>
    </nav>
  );
}
