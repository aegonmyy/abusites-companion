"use client";

// Ported from the reference repo's src/components/MathText.tsx, unchanged
// in behavior: renders inline/block LaTeX delimiters inside plain text via
// KaTeX's auto-render. Pure client-side JS, no Supabase/auth dependency —
// safe to reuse as-is per the brief ("markdown stack ... is pure JS and
// Windows-safe: reuse it").
import { useEffect, useRef } from "react";
import renderMathInElement from "katex/contrib/auto-render";
import "katex/dist/katex.min.css";

const delimiters = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "\\(", right: "\\)", display: false },
  { left: "$", right: "$", display: false },
];

type Props = {
  text?: string | null;
  as?: "span" | "div" | "p";
  className?: string;
};

export default function MathText({ text, as = "span", className }: Props) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const raw = text ?? "";
    const normalized = raw.includes("\\\\") ? raw.replace(/\\\\/g, "\\") : raw;
    ref.current.textContent = normalized;
    renderMathInElement(ref.current, {
      delimiters,
      throwOnError: false,
    });
  }, [text]);

  const Tag = as;

  return (
    <Tag className={className}>
      <span ref={ref}>{text ?? ""}</span>
    </Tag>
  );
}
