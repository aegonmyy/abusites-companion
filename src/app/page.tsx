import Link from "next/link";
import QuestionOfDayCard from "@/components/QuestionOfDayCard";
import StreakBadge from "@/components/StreakBadge";

// Ported from Grinnish's app/dashboard/page.tsx. Auth/profile/notifications/
// sign-out chrome is dropped (no-auth, single implicit local user), so the
// dashboard renders unconditionally. The two feature cards at the bottom are
// Grinnish's "Bookmarks" and "Study mode" cards, reused verbatim; a Notes and
// a Settings card are added in Grinnish's own card vocabulary so every local
// feature stays reachable from the hub (Grinnish has no persistent nav bar).
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <div className="min-h-screen px-4 py-10 sm:px-6 sm:py-12" data-testid="dashboard">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mt-2 text-sm text-white/70">
              Welcome back. Everything below runs on this machine — no network
              required once the model is downloaded.
            </p>
          </div>
        </header>

        <section className="grid gap-4 rounded-2xl border border-white/10 bg-white/10 p-6 shadow-xl backdrop-blur">
          <h2 className="text-xl font-semibold text-white">Today&apos;s focus</h2>
          <p className="text-sm text-white/70">
            Start by building a study plan, or run today&apos;s quiz below.
          </p>
          <StreakBadge />
          <div className="flex flex-wrap gap-3">
            <Link
              href="/study"
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900"
            >
              New study session
            </Link>
            <Link
              className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white"
              href="/past-questions"
            >
              Past questions
            </Link>
            <Link
              className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white"
              href="/notes"
            >
              Notes
            </Link>
          </div>
        </section>

        <QuestionOfDayCard />

        <section className="grid gap-4 md:grid-cols-2">
          <div className="flex h-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/10 p-6 shadow-xl backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Bookmarks</h2>
                <p className="text-sm text-white/70">
                  Review questions, notes, and subunits you saved for later.
                </p>
              </div>
            </div>
            <Link
              href="/bookmarks"
              className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80"
            >
              View bookmarks
            </Link>
          </div>

          <div className="flex h-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/10 p-6 shadow-xl backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Settings</h2>
                <p className="text-sm text-white/70">
                  Choose reply language — English, Hausa, or a natural mix.
                </p>
              </div>
            </div>
            <Link
              href="/settings"
              className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80"
            >
              Open settings
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
