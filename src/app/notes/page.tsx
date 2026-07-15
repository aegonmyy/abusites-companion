"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type NoteSummary = {
  id: string;
  title: string;
  sourceType: string;
  summary: string;
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
    <div className="flex flex-col gap-4" data-testid="notes-page">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Notes</h1>
          <p className="text-sm text-black/60 dark:text-white/60 mt-1">
            Paste notes or snap a photo of study material — the local model summarizes it,
            pulls out key concepts, and builds a quiz.
          </p>
        </div>
        <Link
          href="/notes/new"
          data-testid="new-note-button"
          className="shrink-0 rounded-full bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm font-medium"
        >
          New note
        </Link>
      </div>

      {!notes && <p className="text-sm text-black/60 dark:text-white/60">Loading…</p>}

      {notes && notes.length === 0 && (
        <p data-testid="notes-empty" className="text-sm text-black/60 dark:text-white/60">
          No notes yet. Start with &quot;New note&quot;.
        </p>
      )}

      <ul className="flex flex-col gap-2" data-testid="notes-list">
        {notes?.map((n) => (
          <li key={n.id}>
            <Link
              href={`/notes/${n.id}`}
              className="block border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{n.title}</span>
                <span className="text-xs text-black/50 dark:text-white/50">
                  {SOURCE_LABEL[n.sourceType] ?? n.sourceType}
                </span>
              </div>
              <p className="text-sm text-black/60 dark:text-white/60 mt-1 line-clamp-2">{n.summary}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
