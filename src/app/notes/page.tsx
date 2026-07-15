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
          <p className="text-sm muted mt-1">
            Paste notes or snap a photo of study material — the local model summarizes it,
            pulls out key concepts, and builds a quiz.
          </p>
        </div>
        <Link
          href="/notes/new"
          data-testid="new-note-button"
          className="btn btn-primary shrink-0"
        >
          New note
        </Link>
      </div>

      {!notes && <p className="text-sm muted">Loading…</p>}

      {notes && notes.length === 0 && (
        <p data-testid="notes-empty" className="text-sm muted">
          No notes yet. Start with &quot;New note&quot;.
        </p>
      )}

      <ul className="flex flex-col gap-3" data-testid="notes-list">
        {notes?.map((n) => (
          <li key={n.id}>
            <Link
              href={`/notes/${n.id}`}
              className="card-link block px-4 py-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{n.title}</span>
                <span className="chip-neutral">
                  {SOURCE_LABEL[n.sourceType] ?? n.sourceType}
                </span>
              </div>
              <p className="text-sm muted mt-1 line-clamp-2">{n.summary}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
