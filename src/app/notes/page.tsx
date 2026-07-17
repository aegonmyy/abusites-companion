"use client";

// Notes list. Grinnish's Notes screen was a static mock (fake chat, dummy
// "focus settings"), so its markup can't be copied literally without losing
// the local app's real note features. Instead it's rebuilt in Grinnish's own
// vocabulary — the max-w-6xl header, glass cards, white pill buttons — so it
// reads as Grinnish while driving the real /api/notes data.

import Link from "next/link";
import { useEffect, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";

type NoteSummary = {
  id: string;
  title: string;
  sourceType: string;
  summary: string | null;
  segmentCount: number | null;
  createdAt: string;
};

const SOURCE_LABEL: Record<string, string> = {
  text: "Pasted text",
  image: "Photo",
  pdf: "PDF",
};

export default function NotesPage() {
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/notes")
      .then((r) => r.json())
      .then(setNotes);
  }, []);

  return (
    <div className="min-h-dvh px-6 py-12" data-testid="notes-page">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white">Notes</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              Paste notes, upload a PDF, or snap a photo. It gets split into
              segments you can open one at a time, with a quiz whenever you're ready.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/notes/new"
              data-testid="new-note-button"
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900"
            >
              New note
            </Link>
            <Link
              href="/"
              className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 transition hover:border-white/40"
            >
              Back to dashboard
            </Link>
          </div>
        </div>

        <div className="mt-8">
          {!notes ? (
            <div className="card-deep flex items-center gap-3 rounded-2xl p-6 text-sm text-white/70">
              <LoadingSpinner size={18} label="Loading" />
              Loading…
            </div>
          ) : notes.length === 0 ? (
            <div
              data-testid="notes-empty"
              className="card-deep rounded-2xl p-6 text-sm text-white/70"
            >
              No notes yet. Start with &quot;New note&quot;.
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2" data-testid="notes-list">
              {notes.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/notes/${n.id}`}
                    className="card-deep block h-full rounded-2xl p-5 transition hover:border-white/30"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white">{n.title}</span>
                      <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-white/60">
                        {SOURCE_LABEL[n.sourceType] ?? n.sourceType}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-white/70">
                      {n.segmentCount != null
                        ? `${n.segmentCount} segment${n.segmentCount === 1 ? "" : "s"}`
                        : (n.summary ?? "")}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
