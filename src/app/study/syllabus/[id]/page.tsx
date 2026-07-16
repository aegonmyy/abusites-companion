"use client";

import { use, useEffect, useState } from "react";
import SyllabusView from "../../SyllabusView";
import LoadingSpinner from "@/components/LoadingSpinner";

// Deep-link / re-open route for a saved syllabus. Loads the syllabus from the
// local API and hands its JSON to the ported SyllabusView (single component
// that renders both the syllabus tree and the split chat view).
type SyllabusResponse = {
  id: string;
  topic: string;
  goal: string;
  units: unknown[];
};

export default function SyllabusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [raw, setRaw] = useState<string | null>(null);
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
      })
      .catch(() => setNotFound(true));
  }, [id]);

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto w-full max-w-5xl">
        {notFound ? (
          <p className="text-sm text-white/70">Syllabus not found.</p>
        ) : !raw ? (
          <p className="flex items-center gap-3 text-sm text-white/70">
            <LoadingSpinner size={18} label="Loading" />
            Loading syllabus…
          </p>
        ) : (
          <SyllabusView raw={raw} syllabusId={id} />
        )}
      </div>
    </div>
  );
}
