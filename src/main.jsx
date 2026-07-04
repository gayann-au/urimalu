import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App.jsx";
import { isSupabaseConfigured } from "./lib/supabase.js";
import "./index.css";

// Friendly fallback shown when the app cannot boot, for example when the
// Supabase environment variables are missing or invalid. Uses inline styles so
// it never depends on anything that might have failed to load.
function AppLoadError() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#fbf9f7",
        color: "#1a1413",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: "420px" }}>
        <h1 style={{ fontSize: "1.35rem", fontWeight: 700, margin: "0 0 10px" }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: "1rem", lineHeight: 1.5, color: "#6b5e5a", margin: 0 }}>
          Something went wrong loading the app, please try again later.
        </p>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));

// Only mount the real app when Supabase is configured. Otherwise show the
// friendly fallback so a config problem never renders a blank white screen.
if (isSupabaseConfigured) {
  root.render(
    <React.StrictMode>
      <App/>
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <AppLoadError/>
    </React.StrictMode>
  );
}

// PWA: register the app-shell service worker. Production builds only, because
// under the dev server it would interfere with Vite module serving. A failed
// registration is non-fatal: the app simply runs without install support.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
