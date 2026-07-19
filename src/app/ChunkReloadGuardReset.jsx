import { useEffect } from "react";

// Clears the one-time chunk-reload guard once the shared Suspense boundary has
// resolved to real routed content. This component is a sibling of <Routes>
// inside that boundary, so it only mounts after a lazy route chunk has actually
// loaded. A persistent chunk failure never resolves the boundary, so this never
// mounts and the guard stays set, letting ErrorBoundary fall through to its
// fallback after a single reload instead of looping. Timing-independent: there
// is no timer, the clear is driven purely by the boundary resolving. Renders
// nothing; exists only for the side effect, like NotificationsRealtimeMount.
export default function ChunkReloadGuardReset() {
  useEffect(() => {
    sessionStorage.removeItem("urimalu-chunk-reload");
  }, []);
  return null;
}
