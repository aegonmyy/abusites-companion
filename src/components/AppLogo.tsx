import Link from "next/link";

// Ported from Grinnish's src/components/AppLogo.tsx. The Supabase auth check
// is stripped — this is a no-auth, single-user local app, so the brand always
// links to the home dashboard.
export default function AppLogo() {
  return (
    <Link href="/" className="app-logo" aria-label="Grinnish home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="Grinnish" />
    </Link>
  );
}
