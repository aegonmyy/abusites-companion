"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, StudyIcon, NotesIcon, PastQsIcon } from "@/components/icons/NavIcons";

const TABS = [
  { href: "/", label: "Home", Icon: HomeIcon, testid: "tab-home" },
  { href: "/study", label: "Study", Icon: StudyIcon, testid: "tab-study" },
  { href: "/notes", label: "Notes", Icon: NotesIcon, testid: "tab-notes" },
  { href: "/past-questions", label: "Past Qs", Icon: PastQsIcon, testid: "tab-past-questions" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Persistent mobile bottom nav, reintroduced after the initial port dropped
 * the old edge-to-edge NavBar in favor of in-page cards. Styled as one of
 * the earlier reference design's own floating glass cards (`bg-white/10 border-white/10
 * backdrop-blur`, `rounded-*`, `shadow-xl` — the exact vocabulary used by
 * every card on the dashboard, see src/app/page.tsx) rather than a flat bar
 * docked to the screen edge: `inset-x-4 bottom-4` keeps a real margin on
 * all three exposed sides so it reads as a hovering capsule, Telegram-style
 * but explicitly not edge-to-edge. Mobile only (`sm:hidden`), matching the
 * same 640px breakpoint used everywhere else for this mobile/desktop split.
 */
export default function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      data-testid="mobile-tabbar"
      className="fixed inset-x-4 bottom-4 z-50 flex items-stretch justify-between gap-1 rounded-3xl border border-white/10 bg-white/10 px-2 py-2 shadow-xl backdrop-blur sm:hidden"
    >
      {TABS.map(({ href, label, Icon, testid }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            data-testid={testid}
            data-active={active ? "true" : undefined}
            className={
              "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-medium transition " +
              (active ? "bg-emerald-500/15 text-emerald-300" : "text-white/60")
            }
          >
            <Icon />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
