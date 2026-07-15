import Link from "next/link";
import QuestionOfDayCard from "@/components/QuestionOfDayCard";

const QUICK_LINKS = [
  { href: "/study", title: "Study mode", desc: "Tell it a topic and goal; get a compact syllabus and a subunit tutor." },
  { href: "/past-questions", title: "Past questions", desc: "Browse courses and their past exam questions." },
  { href: "/bookmarks", title: "Bookmarks", desc: "Saved questions and subunits, revisitable offline." },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-8" data-testid="dashboard">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Grinnish Local</h1>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1">
          Offline study companion. Everything below runs on this machine —
          no network required once the model is downloaded.
        </p>
      </div>

      <QuestionOfDayCard />

      <div className="grid gap-3 sm:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-xl border border-black/10 dark:border-white/10 p-4 hover:border-black/30 dark:hover:border-white/30 flex flex-col gap-1"
          >
            <span className="font-medium">{link.title}</span>
            <span className="text-sm text-black/60 dark:text-white/60">{link.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
