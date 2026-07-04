import { Link } from "react-router-dom";
import { Header } from "../../components/layout/Header";
import { GlowBackdrop } from "../../components/ui/GlowBackdrop";

// Shared shell for the public legal pages (Privacy, Terms). Uses the same
// brand header, warm paper surface, and chilli display title as the rest of
// the app, so the legal pages no longer look like a separate site. Content
// stays a readable text column with a footer that cross links the two pages.
export default function LegalPage({ title, lastUpdated, children }) {
  return (
    <div className="flex flex-col flex-1 isolate">
      <GlowBackdrop/>
      <Header showBack/>

      <main className="mx-auto w-full max-w-3xl px-5 py-8 flex-1">
        <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight text-chilli-700">{title}</h1>
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
