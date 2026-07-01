import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

// Google Identity Services loader and button.
//
// Loads the GIS client script on demand, renders the official "Sign in with
// Google" button, and shows the One Tap prompt. The credential returned by
// Google (a signed JWT) is handed back through onCredential, where Supabase
// verifies it server side. Renders nothing when the client id is not set, so
// the login page keeps working without Google configured.

const GSI_SRC = "https://accounts.google.com/gsi/client";
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Inject the GIS script once and resolve when google.accounts.id is ready.
// Concurrent callers share the same in flight promise.
function loadGsi() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!window.__urimaluGsiPromise) {
    window.__urimaluGsiPromise = new Promise((resolve, reject) => {
      const ready = () =>
        window.google?.accounts?.id ? resolve() : reject(new Error("gsi unavailable"));
      const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", ready);
        existing.addEventListener("error", () => reject(new Error("gsi script failed")));
        return;
      }
      const script = document.createElement("script");
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      script.onload = ready;
      script.onerror = () => reject(new Error("gsi script failed"));
      document.head.appendChild(script);
    });
  }
  return window.__urimaluGsiPromise;
}

export function GoogleSignInButton({ onCredential }) {
  const { t, i18n } = useTranslation();
  const holder = useRef(null);
  // Keep the latest callback in a ref so the setup effect does not need
  // onCredential in its deps and does not re initialise GIS on every parent
  // render. It re runs only when the app language changes.
  const callbackRef = useRef(onCredential);
  const promptedRef = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    callbackRef.current = onCredential;
  }, [onCredential]);

  // The current app language, passed to GIS as hl so the button and One Tap
  // render in the app language instead of the browser system locale.
  const lang = i18n.language;

  useEffect(() => {
    if (!clientId || !holder.current) return undefined;
    let cancelled = false;

    loadGsi()
      .then(() => {
        if (cancelled || !holder.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          hl: lang,
          callback: (response) => {
            if (response?.credential) callbackRef.current(response.credential);
          },
        });
        // Clear any button from a previous render so a language change swaps the
        // button cleanly instead of stacking a second one.
        holder.current.replaceChildren();
        window.google.accounts.id.renderButton(holder.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "pill",
          width: holder.current.offsetWidth || 320,
          logo_alignment: "center",
          hl: lang,
        });
        // Show the One Tap prompt only once, so switching language does not
        // re prompt on every change.
        if (!promptedRef.current) {
          promptedRef.current = true;
          window.google.accounts.id.prompt();
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [lang]);

  // No client id means Google sign-in is not configured at all, so render
  // nothing. A load failure is different: the feature exists but the Google
  // script could not load, so tell the user and point them back at email and
  // password, which still work.
  if (!clientId) return null;
  if (failed) {
    return <p className="text-center text-sm text-ink-500">{t("auth.googleUnavailable")}</p>;
  }
  return <div ref={holder} className="flex w-full justify-center" />;
}
