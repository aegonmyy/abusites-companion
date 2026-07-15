import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist's Node ("legacy") build resolves its worker via a relative
  // dynamic import at runtime (its own internal fake-worker fallback for
  // non-browser environments). Bundling it with webpack breaks that
  // resolution ("Cannot find module '.../pdf.worker.mjs'") because the
  // physical file layout it depends on doesn't survive bundling. Marking
  // it external makes Next.js load it unbundled straight from
  // node_modules at runtime instead, where its relative paths are intact.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
