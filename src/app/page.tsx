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
        <p className="text-sm muted mt-1">
          Offline study companion. Everything below runs on this machine —
          no network required once the model is downloaded.
        </p>
      </div>

      <QuestionOfDayCard />

      <div className="grid gap-4 sm:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="card-link p-5 flex flex-col gap-1.5"
          >
            <span className="font-semibold">{link.title}</span>
            <span className="text-sm muted">{link.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
