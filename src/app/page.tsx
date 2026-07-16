import Link from "next/link";
import QuestionOfDayCard from "@/components/QuestionOfDayCard";
import StreakBadge from "@/components/StreakBadge";
import ContinueCard from "@/components/ContinueCard";

// Ported from Grinnish's app/dashboard/page.tsx, then trimmed to remove
// duplication: the quick-link row (New study session / Past questions /
// Notes) duplicated the floating bottom tab bar, and the full Bookmarks +
// Settings cards duplicated the Home-only HeaderIcons (see
// src/components/HeaderIcons.tsx). What's left: the streak badge, a
// "Continue" card (most recent subunit visit or note, see
// src/components/ContinueCard.tsx), question of the day, and a few topic
// suggestion chips into Study mode.
export const dynamic = "force-dynamic";

// Short, varied example topics for a Nigerian university student studying
// offline — picked to read as real course material, not filler. Each links
// straight into /study with the topic pre-filled via ?topic=.
const SUGGESTED_TOPICS = [
  "Organic Chemistry: reaction mechanisms",
  "Nigerian Government & Constitution",
  "Cell Biology: photosynthesis",
];

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

        <StreakBadge />

        <ContinueCard />

        <QuestionOfDayCard />

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/50">
            Start something new
          </h2>
          <div className="flex flex-wrap gap-2" data-testid="topic-suggestions">
            {SUGGESTED_TOPICS.map((topic) => (
              <Link
                key={topic}
                href={`/study?topic=${encodeURIComponent(topic)}`}
                data-testid="topic-suggestion-chip"
                className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-white/40 hover:text-white"
              >
                {topic}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
