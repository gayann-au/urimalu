import { Link } from "react-router-dom";

// Shared shell for the public legal pages (Privacy, Terms). It reads no auth
// state, so it is always safe to render for logged out visitors. Layout is a
// simple top bar with the brand and a link home, a readable text column, and a
// footer that cross links the two legal pages.
export default function LegalPage({ title, lastUpdated, children }) {
  return (
    <div className="flex flex-col flex-1 bg-white">
      <header className="border-b border-gray-200">
        <div className="mx-auto w-full max-w-3xl px-5 h-14 flex items-center justify-between">
          <Link to="/" className="font-extrabold text-lg text-gray-900">Urimalu</Link>
          <Link to="/" className="text-sm font-semibold text-coorg-700 hover:text-coorg-800">
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-8 flex-1">
        <h1 className="text-3xl font-extrabold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500 mt-2">Last updated: {lastUpdated}</p>

        <div className="mt-6 text-gray-700 leading-relaxed">{children}</div>

        <div className="mt-10 pt-6 border-t border-gray-200 text-sm flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/privacy" className="font-semibold text-coorg-700 hover:text-coorg-800">
            Privacy Policy
          </Link>
          <Link to="/terms" className="font-semibold text-coorg-700 hover:text-coorg-800">
            Terms of Service
          </Link>
          <Link to="/login" className="font-semibold text-coorg-700 hover:text-coorg-800">
            Log in
          </Link>
        </div>
      </main>
    </div>
  );
}

// Small text helpers so the policy content stays readable and consistent.
// They restore normal heading and list styling that Tailwind preflight strips.
export function H2({ children }) {
  return <h2 className="text-lg font-bold text-gray-900 mt-8 mb-2">{children}</h2>;
}

export function P({ children }) {
  return <p className="mb-3">{children}</p>;
}

export function UL({ children }) {
  return <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>;
}
