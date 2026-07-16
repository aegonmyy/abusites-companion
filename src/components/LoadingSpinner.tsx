/**
 * A small CSS-only spinner (three squares shuffling around a 2x2 grid),
 * sourced from svg-spinners (MIT) and recolored to the app's existing
 * emerald "active/selected" accent via currentColor:
 * https://github.com/n3r4zzurr0/svg-spinners/blob/main/svg-css/blocks-shuffle-3.svg
 *
 * No JS animation library, no external asset fetch — pure inline SVG +
 * CSS keyframes, so it costs nothing extra on the target CPU and works
 * fully offline like everything else in this app.
 */
export default function LoadingSpinner({
  size = 24,
  className,
  label = "Loading",
}: {
  size?: number;
  /** Overrides the default emerald color entirely (e.g. "text-slate-900"
   * for use on a light button) rather than merging, so callers never have
   * to fight Tailwind's cascade order to change the color. */
  className?: string;
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="status"
      aria-label={label}
      className={className ?? "text-emerald-300"}
    >
      <style>{`
        .ll-spinner_9y7u{animation:ll-spinner_fUkk 2.4s linear infinite;animation-delay:-2.4s}
        .ll-spinner_DF2s{animation-delay:-1.6s}
        .ll-spinner_q27e{animation-delay:-.8s}
        @keyframes ll-spinner_fUkk{
          8.33%{x:13px;y:1px}
          25%{x:13px;y:1px}
          33.3%{x:13px;y:13px}
          50%{x:13px;y:13px}
          58.33%{x:1px;y:13px}
          75%{x:1px;y:13px}
          83.33%{x:1px;y:1px}
        }
        @media (prefers-reduced-motion: reduce) {
          .ll-spinner_9y7u { animation: none; }
        }
      `}</style>
      <rect className="ll-spinner_9y7u" fill="currentColor" x="1" y="1" rx="1" width="10" height="10" />
      <rect className="ll-spinner_9y7u ll-spinner_DF2s" fill="currentColor" x="1" y="1" rx="1" width="10" height="10" opacity="0.8" />
      <rect className="ll-spinner_9y7u ll-spinner_q27e" fill="currentColor" x="1" y="1" rx="1" width="10" height="10" opacity="0.6" />
    </svg>
  );
}
