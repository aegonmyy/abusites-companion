"use client";

import { useEffect, useState } from "react";

type Bookmark = {
  id: string;
  kind: string;
  refId: string;
  label: string;
  createdAt: string;
};

const KIND_LABEL: Record<string, string> = {
  past_question: "Past question",
  subunit: "Study subunit",
  note: "Note",
};

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<Bookmark[] | null>(null);

  useEffect(() => {
    fetch("/api/bookmarks")
      .then((r) => r.json())
      .then(setBookmarks);
  }, []);

  async function remove(id: string) {
    setBookmarks((prev) => prev?.filter((b) => b.id !== id) ?? prev);
    await fetch(`/api/bookmarks/${id}`, { method: "DELETE" });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="bookmarks-page">
      <div>
        <h1 className="text-xl font-semibold">Bookmarks</h1>
        <p className="text-sm muted mt-1">
          Saved locally. Revisitable offline.
        </p>
      </div>

      {!bookmarks && <p className="text-sm muted">Loading…</p>}

      {bookmarks && bookmarks.length === 0 && (
        <p data-testid="bookmarks-empty" className="text-sm muted">
          No bookmarks yet.
        </p>
      )}

      <ul className="flex flex-col gap-3" data-testid="bookmarks-list">
        {bookmarks?.map((b) => (
          <li
            key={b.id}
            className="card flex items-center justify-between gap-3 px-4 py-3"
          >
            <span className="flex flex-col gap-1 min-w-0">
              <span className="chip-neutral self-start">
                {KIND_LABEL[b.kind] ?? b.kind}
              </span>
              <span className="truncate">{b.label}</span>
            </span>
            <button
              type="button"
              onClick={() => remove(b.id)}
              className="text-xs font-medium shrink-0"
              style={{ color: "var(--bad)" }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
