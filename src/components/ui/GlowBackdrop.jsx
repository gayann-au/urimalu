// Soft warm brand glow shared by every app screen, cloned from the landing
// hero glow. It reuses the same ember-500 and chilli-600 tones at low alpha
// (see .page-glow in index.css) fading into the cream paper background, so
// the whole app shares one light source in the top right corner.
//
// Usage: render as the first child of a page root that carries the isolate
// class. The isolation keeps the glow above the paper background but below
// every card, form, and text block, so readability is never affected.
export function GlowBackdrop() {
  return <div aria-hidden="true" className="page-glow" />;
}
