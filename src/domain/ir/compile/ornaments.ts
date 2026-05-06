/**
 * Preset ornament catalog for the v4.16 `decoration` node.
 *
 * Each preset is an inline SVG primitive used to add visual texture
 * (glow rings, dotted grids, corner brackets) without requiring an
 * uploaded asset. Same pattern as v4.13 `icons.ts` — drop the SVG
 * into the slide HTML and let the parent CSS set `color` so any
 * `currentColor` stroke/fill inherits the soul accent token.
 *
 * Each preset declares a default `width` × `height` (in CSS px) so the
 * decoration node can omit `placement.size` for sensible defaults.
 * Authors override via `placement.size`.
 *
 * Add a preset by:
 *   1. Adding the name to `PresetOrnamentNameSchema` in nodes.ts.
 *   2. Adding the entry below.
 *   3. Updating the v4.16 plan + recipe registry.
 */

import type { PresetOrnamentName } from '../nodes.js';

export interface PresetOrnamentDef {
  /** Default natural size in px when placement.size is omitted. */
  defaultWidth: number;
  defaultHeight: number;
  /** Inline SVG. Must declare `viewBox`. Use `currentColor` for fills /
   *  strokes that should adapt to the resolved accent token. */
  svg: string;
  /** When true, the parent decoration wrapper applies a soul accent
   *  color via `color: var(--color-...)`. Presets that set their own
   *  fills (e.g. radial_glow uses gradients with explicit stops) should
   *  set this to false to opt out of accent tinting. */
  acceptsAccent: boolean;
}

const ORNAMENTS: Record<PresetOrnamentName, PresetOrnamentDef> = {
  // Concentric ring halo — Galici slide 3 "shield + glow ring" pattern.
  glow_ring: {
    defaultWidth: 480,
    defaultHeight: 480,
    acceptsAccent: true,
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480" aria-hidden="true">' +
      '<circle cx="240" cy="240" r="120" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>' +
      '<circle cx="240" cy="240" r="170" fill="none" stroke="currentColor" stroke-width="1" opacity="0.35"/>' +
      '<circle cx="240" cy="240" r="220" fill="none" stroke="currentColor" stroke-width="0.75" opacity="0.18"/>' +
      '</svg>',
  },

  // Soft radial gradient backdrop. The gradient stops use currentColor
  // (accent) blended to transparent — agents can tint via `accent` and
  // the fade-to-transparent edges keep the slide canvas legible.
  radial_glow: {
    defaultWidth: 800,
    defaultHeight: 800,
    acceptsAccent: true,
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" aria-hidden="true">' +
      '<defs><radialGradient id="pengui-radial-glow" cx="50%" cy="50%" r="50%">' +
      '<stop offset="0%" stop-color="currentColor" stop-opacity="0.45"/>' +
      '<stop offset="55%" stop-color="currentColor" stop-opacity="0.10"/>' +
      '<stop offset="100%" stop-color="currentColor" stop-opacity="0"/>' +
      '</radialGradient></defs>' +
      '<circle cx="400" cy="400" r="400" fill="url(#pengui-radial-glow)"/>' +
      '</svg>',
  },

  // Dotted grid — texture for negative space. Tiles via SVG pattern so
  // resizing keeps the dot density consistent.
  grid_dots: {
    defaultWidth: 320,
    defaultHeight: 320,
    acceptsAccent: true,
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" aria-hidden="true">' +
      '<defs><pattern id="pengui-grid-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">' +
      '<circle cx="10" cy="10" r="1.25" fill="currentColor" opacity="0.28"/>' +
      '</pattern></defs>' +
      '<rect width="320" height="320" fill="url(#pengui-grid-dots)"/>' +
      '</svg>',
  },

  // L-shaped corner bracket — emphasis frame for quotes / callouts.
  corner_bracket: {
    defaultWidth: 96,
    defaultHeight: 96,
    acceptsAccent: true,
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" aria-hidden="true" fill="none">' +
      '<path d="M8 32V12a4 4 0 0 1 4-4h20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' +
      '<path d="M88 64v20a4 4 0 0 1-4 4H64" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' +
      '</svg>',
  },

  // Directional chevron — accent arrow for flow / process.
  chevron_arrow: {
    defaultWidth: 80,
    defaultHeight: 64,
    acceptsAccent: true,
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 64" aria-hidden="true" fill="none">' +
      '<path d="M16 8 48 32 16 56" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>' +
      '<path d="M40 8 72 32 40 56" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>',
  },

  // Subtle grain overlay — adds film-grain texture to photo-heavy slides
  // without requiring a raster asset. Uses fractalNoise turbulence
  // filtered to low alpha so it tints rather than dominates.
  noise_overlay: {
    defaultWidth: 800,
    defaultHeight: 600,
    acceptsAccent: false,
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" aria-hidden="true">' +
      '<defs><filter id="pengui-noise"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3"/>' +
      '<feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0"/></filter></defs>' +
      '<rect width="800" height="600" filter="url(#pengui-noise)"/>' +
      '</svg>',
  },
};

export function getOrnamentDef(name: PresetOrnamentName): PresetOrnamentDef {
  const def = ORNAMENTS[name];
  if (!def) {
    throw new Error(`Unknown preset ornament: ${String(name)}`);
  }
  return def;
}

export function listOrnamentNames(): PresetOrnamentName[] {
  return Object.keys(ORNAMENTS) as PresetOrnamentName[];
}
