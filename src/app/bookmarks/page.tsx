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
        <p className="text-sm text-black/60 dark:text-white/60 mt-1">
          Saved locally. Revisitable offline.
        </p>
      </div>

      {!bookmarks && <p className="text-sm text-black/60 dark:text-white/60">Loading…</p>}

      {bookmarks && bookmarks.length === 0 && (
        <p data-testid="bookmarks-empty" className="text-sm text-black/60 dark:text-white/60">
          No bookmarks yet.
        </p>
      )}

      <ul className="flex flex-col gap-2" data-testid="bookmarks-list">
        {bookmarks?.map((b) => (
          <li
            key={b.id}
            className="flex items-center justify-between border border-black/10 dark:border-white/10 rounded-lg px-3 py-2"
          >
            <span>
              <span className="text-xs text-black/50 dark:text-white/50 mr-2">
                {KIND_LABEL[b.kind] ?? b.kind}
              </span>
              {b.label}
            </span>
            <button
              type="button"
              onClick={() => remove(b.id)}
              className="text-xs underline text-black/60 dark:text-white/60"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
