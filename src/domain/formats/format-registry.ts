/**
 * Format registry for Pengui Slides.
 *
 * Maps each FormatKind to its Format definition. The registry is the
 * single source of truth for geometry; every rendering/validation/export
 * site reads from here instead of carrying its own hardcoded dimensions.
 *
 * See SPEC.md §3 for the schema and the rationale behind each geometry.
 */

import type { Format, FormatKind } from '../../types/format.js';
import type { AuthoringModel } from '../../types/deck.js';

export const FORMAT_REGISTRY: Record<FormatKind, Format> = {
  slides_16_9: {
    kind: 'slides_16_9',
    geometry: {
      widthPx: 1920,
      heightPx: 1080,
      safeAreaInsetPx: 48,
      dpi: 96,
      orientation: 'landscape',
      medium: 'slides',
      physicalPage: null,
      thumbnailAspect: 16 / 9,
    },
  },
  print_a4_portrait: {
    kind: 'print_a4_portrait',
    geometry: {
      widthPx: 1240,
      heightPx: 1754,
      safeAreaInsetPx: 96,
      dpi: 150,
      orientation: 'portrait',
      medium: 'print',
      physicalPage: 'A4',
      thumbnailAspect: 1240 / 1754,
    },
  },
  print_letter_portrait: {
    kind: 'print_letter_portrait',
    geometry: {
      widthPx: 1275,
      heightPx: 1650,
      safeAreaInsetPx: 96,
      dpi: 150,
      orientation: 'portrait',
      medium: 'print',
      physicalPage: 'Letter',
      thumbnailAspect: 1275 / 1650,
    },
  },
};

export const DEFAULT_FORMAT: FormatKind = 'slides_16_9';

export const PRINT_FORMATS: readonly FormatKind[] = [
  'print_a4_portrait',
  'print_letter_portrait',
];

export const SLIDE_FORMATS: readonly FormatKind[] = ['slides_16_9'];

export function getFormat(kind: FormatKind | undefined): Format {
  return FORMAT_REGISTRY[kind ?? DEFAULT_FORMAT];
}

export function isPrintFormat(kind: FormatKind | undefined): boolean {
  const resolved = kind ?? DEFAULT_FORMAT;
  return FORMAT_REGISTRY[resolved].geometry.medium === 'print';
}

export function isSlideFormat(kind: FormatKind | undefined): boolean {
  const resolved = kind ?? DEFAULT_FORMAT;
  return FORMAT_REGISTRY[resolved].geometry.medium === 'slides';
}

export function assertKnownFormat(kind: string): asserts kind is FormatKind {
  if (!(kind in FORMAT_REGISTRY)) {
    throw new Error(
      `unknown_format: "${kind}" is not a registered format. Known: ${Object.keys(FORMAT_REGISTRY).join(', ')}`,
    );
  }
}

/**
 * Default authoring model per format. Print formats produce continuous
 * documents; slide formats produce page-bound slides. Called once at deck
 * creation; the chosen model is then stored on the deck.
 */
export function defaultAuthoringModelFor(kind: FormatKind): AuthoringModel {
  return isPrintFormat(kind) ? 'document' : 'slides';
}
