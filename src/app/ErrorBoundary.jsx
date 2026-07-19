import { Component } from "react";

// A stale-deploy chunk-load failure: a tab opened before a new deploy navigates
// to a lazy route whose old hashed chunk filename was deleted by the newer
// Netlify deploy, so the dynamic import throws one of these messages. A single
// automatic reload pulls the fresh app shell and its new chunk names.
const CHUNK_LOAD_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;
// One-time guard so an error that keeps recurring (offline, blocked script)
// falls through to the normal fallback instead of reloading forever.
const CHUNK_RELOAD_KEY = "urimalu-chunk-reload";

function isRecoverableChunkError(error) {
  return !!error && CHUNK_LOAD_ERROR_PATTERN.test(error.message || "");
}

// App-wide error boundary. Any render-time exception below this point is caught
// here and shown as a friendly message with a reload action, instead of React
// unmounting the whole tree to a blank white screen. Uses inline styles so the
// fallback never depends on app CSS or context that might also have failed.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, recovering: false };
  }

  static getDerivedStateFromError(error) {
    // For a recoverable chunk-load error that has not yet used its one-time
    // reload this session, keep the fallback hidden (recovering) while
    // componentDidCatch performs the reload. Every other error, and a repeat
    // chunk error after the reload already happened, shows the fallback.
    if (isRecoverableChunkError(error) && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
      return { hasError: true, recovering: true };
    }
    return { hasError: true, recovering: false };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
    if (isRecoverableChunkError(error) && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
      window.location.reload();
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    // A one-time recovery reload is in flight; render nothing so the normal
    // fallback never flashes before the page reloads.
    if (this.state.recovering) return null;
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
          <p style={{ fontSize: "1rem", lineHeight: 1.5, color: "#6b5e5a", margin: "0 0 20px" }}>
            The page ran into an unexpected problem. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              minHeight: "44px",
              padding: "0 22px",
              borderRadius: "14px",
              border: "none",
              background: "#1f7d44",
              color: "#ffffff",
              fontSize: "0.95rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
