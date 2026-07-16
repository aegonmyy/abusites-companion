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

// A large static pool of real course-material topics for a Nigerian
// university student, spanning the sciences, humanities, and general-studies
// courses this app's seeded course catalog actually covers. Each links
// straight into /study with the topic pre-filled via ?topic=. No model call
// needed to generate these — three are picked at random from this pool on
// every page load (the page is `force-dynamic`, so this re-runs per
// request), which is enough to make Home feel alive without adding any
// latency or Ollama dependency to a page that should load instantly.
const SUGGESTED_TOPICS_POOL = [
  "Organic Chemistry: reaction mechanisms",
  "Nigerian Government & Constitution",
  "Cell Biology: photosynthesis",
  "Newton's Laws of Motion",
  "Indirect Rule in Colonial Nigeria",
  "Basic Trigonometric Identities",
  "The Nigerian Civil War: causes and outcomes",
  "Cellular Respiration and ATP Production",
  "Supply and Demand in Microeconomics",
  "Genetics: Mendelian Inheritance",
  "Nigeria's Federal System of Government",
  "Thermodynamics: the First and Second Laws",
  "Limits and Continuity in Calculus",
  "The Structure of the Atom",
  "Nigeria's Independence Movement (1900s-1960)",
  "Human Circulatory System",
  "Balancing Chemical Equations",
  "Introduction to Object-Oriented Programming",
  "The Water Cycle and Its Stages",
  "Nigeria's Ethnic Groups and Regional History",
  "Probability and Statistics Basics",
  "Plant Reproduction and Pollination",
  "The Nigerian Legal System",
  "Electric Circuits: Series and Parallel",
  "Macroeconomics: Inflation and GDP",
  "DNA Replication and Protein Synthesis",
  "Nigeria's Agricultural Sector",
  "Acids, Bases, and pH",
  "Sets and Set Theory",
  "The Nigerian Constitution of 1999",
  "Ecology and Food Chains",
  "Basic Algebra: Solving Linear Equations",
  "The Periodic Table and Element Groups",
  "Nigeria's Oil Economy",
  "Waves: Sound and Light",
  "Hausa Language Basics: Greetings and Numbers",
  "The Respiratory System",
  "Vectors and Scalars in Physics",
  "Nigeria's Judiciary and Separation of Powers",
  "Photosynthesis vs. Cellular Respiration",
];

/** Fisher-Yates partial shuffle, first `count` elements — avoids the
 * `sort(() => Math.random() - 0.5)` anti-pattern's uneven distribution. */
function pickRandomTopics(pool: string[], count: number): string[] {
  const arr = [...pool];
  const n = Math.min(count, arr.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

export default function DashboardPage() {
  const suggestedTopics = pickRandomTopics(SUGGESTED_TOPICS_POOL, 3);
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
            {suggestedTopics.map((topic) => (
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
