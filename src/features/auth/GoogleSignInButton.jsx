import { useEffect, useRef, useState } from "react";

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
  const holder = useRef(null);
  // Keep the latest callback in a ref so the setup effect can run once without
  // re initialising GIS (and re prompting One Tap) on every parent render.
  const callbackRef = useRef(onCredential);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    callbackRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!clientId || !holder.current) return undefined;
    let cancelled = false;

    loadGsi()
      .then(() => {
        if (cancelled || !holder.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response?.credential) callbackRef.current(response.credential);
          },
        });
        window.google.accounts.id.renderButton(holder.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "pill",
          width: holder.current.offsetWidth || 320,
          logo_alignment: "center",
        });
        // One Tap prompt for the GSI experience.
        window.google.accounts.id.prompt();
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!clientId || failed) return null;
  return <div ref={holder} className="flex w-full justify-center" />;
}
