"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t, useLanguage } from "@/lib/i18n";

type IconProps = { className?: string };

// Icon vocabulary carried over from the pre-port NavBar (deleted in 2669d9f
// when Grinnish's card-only navigation replaced it) — same stroke-based
// style already established by MicButton.tsx (stroke="currentColor",
// strokeWidth ~1.8), just re-skinned onto Grinnish's floating glass card.
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

const TABS = [
  { href: "/", key: "nav_home" as const, Icon: HomeIcon, testid: "tab-home" },
  { href: "/study", key: "nav_study" as const, Icon: StudyIcon, testid: "tab-study" },
  { href: "/notes", key: "nav_notes" as const, Icon: NotesIcon, testid: "tab-notes" },
  { href: "/past-questions", key: "nav_past_qs" as const, Icon: PastQsIcon, testid: "tab-past-questions" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Persistent mobile bottom nav, reintroduced after the Grinnish port dropped
 * the old edge-to-edge NavBar in favor of in-page cards. Styled as one of
 * Grinnish's own floating glass cards (`bg-white/10 border-white/10
 * backdrop-blur`, `rounded-*`, `shadow-xl` — the exact vocabulary used by
 * every card on the dashboard, see src/app/page.tsx) rather than a flat bar
 * docked to the screen edge: `inset-x-4 bottom-4` keeps a real margin on
 * all three exposed sides so it reads as a hovering capsule, Telegram-style
 * but explicitly not edge-to-edge. Mobile only (`sm:hidden`), matching the
 * same 640px breakpoint globals.css already uses for `.app-brand`.
 */
export default function BottomTabBar() {
  const pathname = usePathname();
  const language = useLanguage();

  return (
    <nav
      data-testid="mobile-tabbar"
      className="fixed inset-x-4 bottom-4 z-50 flex items-stretch justify-between gap-1 rounded-3xl border border-white/10 bg-white/10 px-2 py-2 shadow-xl backdrop-blur sm:hidden"
    >
      {TABS.map(({ href, key, Icon, testid }) => {
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
            <span>{t(key, language)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
