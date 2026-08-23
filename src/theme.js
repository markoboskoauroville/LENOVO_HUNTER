// The house palette. MANTRA_MANIFEST/modules/design-language.md §3.
// Colour carries state. Shape carries identity. Red is a fault and nothing else.
export const C = {
  bg:        '#0B0D10',   // near-black ground
  surface:   '#141A21',   // card
  surfaceHi: '#1B232C',   // card, raised
  slate:     '#23303D',   // inactive surface
  ink:       '#F2DDB4',   // sand, primary text
  inkDim:    '#8C8676',   // secondary text
  amber:     '#F59E0B',   // the active thing, the lit thing
  amberSoft: '#FBBF24',
  green:     '#34D399',   // in stock
  red:       '#EF4444',   // a real fault, only
  blue:      '#60A5FA',   // pre-order: holding something, not a fault
};

export const S = {
  gap:   12,   // one gap, used everywhere. §10: equal distances.
  gapLg: 20,
  pad:   16,
  radius: 14,
  hair:  StyleSheetHairline(),
};

function StyleSheetHairline() { return 1; }

// Opacity is the only channel used for "not available yet" — it does not touch
// layout, so an idle card occupies exactly the space it will occupy when live.
// §1: nothing appears, nothing disappears.
export const DIM = 0.38;
