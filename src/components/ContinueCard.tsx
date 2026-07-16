"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";

type ContinueResponse =
  | { type: "none" }
  | { type: "subunit" | "note"; title: string; subtitle?: string; href: string };

/**
 * Home's "Continue" card — whichever is more recent between the last
 * subunit visited in Study mode and the last note created, so returning
 * users get a one-tap way back into what they were doing. Renders a plain
 * empty state (no broken/empty card) for a true first-time user.
 */
export default function ContinueCard() {
  const [data, setData] = useState<ContinueResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/continue")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData({ type: "none" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <div className="card-deep card-deep-glow flex items-center gap-3 rounded-2xl p-6 text-sm text-white/70">
        <LoadingSpinner size={18} label="Loading" />
        Loading…
      </div>
    );
  }

  if (data.type === "none") {
    return (
      <div
        data-testid="continue-card-empty"
        className="card-deep card-deep-glow rounded-2xl p-6 text-sm text-white/70"
      >
        Nothing yet — start below.
      </div>
    );
  }

  return (
    <Link
      href={data.href}
      data-testid="continue-card"
      className="card-deep card-deep-glow block rounded-2xl p-6 transition hover:border-white/30"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
        {data.type === "subunit" ? "Continue studying" : "Continue reading"}
      </p>
      <h2 className="mt-2 text-lg font-semibold text-white">{data.title}</h2>
      {data.subtitle ? (
        <p className="mt-1 line-clamp-2 text-sm text-white/70">{data.subtitle}</p>
      ) : null}
    </Link>
  );
}
