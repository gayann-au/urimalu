import { Component } from "react";

// App-wide error boundary. Any render-time exception below this point is caught
// here and shown as a friendly message with a reload action, instead of React
// unmounting the whole tree to a blank white screen. Uses inline styles so the
// fallback never depends on app CSS or context that might also have failed.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
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
