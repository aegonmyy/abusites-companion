"use client";

// Ported from Grinnish's app/bookmarks/page.tsx + BookmarksList.tsx. Grinnish's
// list was past-questions-only (grouped by year from Supabase); the local app's
// bookmarks are mixed-kind (past_question | note | subunit) from /api/bookmarks,
// so the items are rendered in Grinnish's own glass-card vocabulary — the same
// section/card/remove-pill classes — as a generic saved-items list.

import Link from "next/link";
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

const KIND_HREF: Record<string, (refId: string) => string> = {
  note: (refId) => `/notes/${refId}`,
  subunit: (refId) => `/study/syllabus/${refId.split(":")[0]}`,
};

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<Bookmark[] | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/bookmarks")
      .then((r) => r.json())
      .then(setBookmarks);
  }, []);

  async function remove(id: string) {
    setRemovingId(id);
    setBookmarks((prev) => prev?.filter((b) => b.id !== id) ?? prev);
    await fetch(`/api/bookmarks/${id}`, { method: "DELETE" }).catch(() => {});
    setRemovingId(null);
  }

  return (
    <div className="min-h-screen px-6 py-12" data-testid="bookmarks-page">
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white">Bookmarks</h1>
            <p className="mt-2 text-sm text-white/70">
              Your saved questions, notes, and subunits — revisitable offline.
            </p>
          </div>
          <Link href="/" className="nav-button rounded-full px-4 py-2 text-sm font-semibold">
            Back to dashboard
          </Link>
        </header>

        <div className="mt-8">
          {!bookmarks ? (
            <div className="rounded-2xl border border-white/10 bg-white/10 p-6 text-sm text-white/70">
              Loading…
            </div>
          ) : bookmarks.length === 0 ? (
            <div
              data-testid="bookmarks-empty"
              className="rounded-2xl border border-white/10 bg-white/10 p-6 text-sm text-white/70"
            >
              You have no bookmarks yet.
            </div>
          ) : (
            <section
              className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-xl backdrop-blur"
              data-testid="bookmarks-list"
            >
              <div className="grid gap-4">
                {bookmarks.map((b) => {
                  const href = KIND_HREF[b.kind]?.(b.refId);
                  const body = (
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <span className="inline-flex rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
                          {KIND_LABEL[b.kind] ?? b.kind}
                        </span>
                        <p className="mt-2 truncate text-base text-white">{b.label}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          remove(b.id);
                        }}
                        disabled={removingId === b.id}
                        className="shrink-0 rounded-full border border-amber-200/40 px-3 py-1 text-xs font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {removingId === b.id ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  );
                  return href ? (
                    <Link
                      key={b.id}
                      href={href}
                      className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-white/30"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div
                      key={b.id}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
                      {body}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
