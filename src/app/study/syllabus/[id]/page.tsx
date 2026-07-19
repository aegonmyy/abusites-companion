"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import SyllabusView from "../../SyllabusView";
import LoadingSpinner from "@/components/LoadingSpinner";
import { sanitizeStartLanguage } from "@/lib/sanitize-language-mode";
import type { StartLanguage } from "@/lib/prompts";

// Deep-link / re-open route for a saved syllabus. Loads the syllabus from the
// local API and hands its JSON to the ported SyllabusView (single component
// that renders both the syllabus tree and the split chat view).
type SyllabusResponse = {
  id: string;
  topic: string;
  goal: string;
  units: unknown[];
  language?: string;
};

export default function SyllabusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [raw, setRaw] = useState<string | null>(null);
  const [startLanguage, setStartLanguage] = useState<StartLanguage>("english");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/study/syllabus/${id}`)
      .then(async (r) => {
        if (!r.ok) {
          setNotFound(true);
          return;
        }
        const data = (await r.json()) as SyllabusResponse;
        setRaw(JSON.stringify({ topic: data.topic, goal: data.goal, units: data.units }));
        setStartLanguage(sanitizeStartLanguage(data.language));
      })
      .catch(() => setNotFound(true));
  }, [id]);

  return (
    <div className="min-h-dvh px-6 py-12">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-4">
          <Link
            href="/"
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 transition hover:border-white/40"
          >
            Back to dashboard
          </Link>
        </div>
        {notFound ? (
          <p className="text-sm text-white/70">Syllabus not found.</p>
        ) : !raw ? (
          <p className="flex items-center gap-3 text-sm text-white/70">
            <LoadingSpinner size={18} label="Loading" />
            Loading syllabus…
          </p>
        ) : (
          <SyllabusView raw={raw} syllabusId={id} startLanguage={startLanguage} />
        )}
      </div>
    </div>
  );
}
