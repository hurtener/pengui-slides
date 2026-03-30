import path from 'node:path';

export interface ParsedCssColor {
  red: number;
  green: number;
  blue: number;
  alpha?: number;
}

export function normalizeColorChannel(value: number): number {
  if (value <= 1) {
    return Math.max(0, Math.min(1, value));
  }
  return Math.max(0, Math.min(1, value / 255));
}

export function parseCssColor(value?: string): ParsedCssColor | null {
  if (!value) {
    return null;
  }

  const rgba = value.match(/rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)(?:[,\s/]+([0-9.]+))?\s*\)/i);
  if (rgba) {
    return {
      red: normalizeColorChannel(Number.parseFloat(rgba[1])),
      green: normalizeColorChannel(Number.parseFloat(rgba[2])),
      blue: normalizeColorChannel(Number.parseFloat(rgba[3])),
      ...(rgba[4] !== undefined ? { alpha: Number.parseFloat(rgba[4]) } : {}),
    };
  }

  const cssColor4 = value.match(/color\(\s*srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+))?\s*\)/i);
  if (cssColor4) {
    return {
      red: normalizeColorChannel(Number.parseFloat(cssColor4[1])),
      green: normalizeColorChannel(Number.parseFloat(cssColor4[2])),
      blue: normalizeColorChannel(Number.parseFloat(cssColor4[3])),
      ...(cssColor4[4] !== undefined ? { alpha: Number.parseFloat(cssColor4[4]) } : {}),
    };
  }

  const hex = value.trim().match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (hex) {
    const raw = hex[1].length === 3
      ? hex[1].split('').map((char) => char + char).join('')
      : hex[1];
    return {
      red: Number.parseInt(raw.slice(0, 2), 16) / 255,
      green: Number.parseInt(raw.slice(2, 4), 16) / 255,
      blue: Number.parseInt(raw.slice(4, 6), 16) / 255,
    };
  }

  return null;
}

export function blendColorOverBackdrop(color: ParsedCssColor, backdrop?: string): ParsedCssColor {
  if (color.alpha === undefined || color.alpha >= 1 || !backdrop) {
    return color;
  }

  const backdropColor = parseCssColor(backdrop);
  if (!backdropColor) {
    return color;
  }

  const alpha = Math.max(0, Math.min(1, color.alpha));
  return {
    red: (color.red * alpha) + (backdropColor.red * (1 - alpha)),
    green: (color.green * alpha) + (backdropColor.green * (1 - alpha)),
    blue: (color.blue * alpha) + (backdropColor.blue * (1 - alpha)),
  };
}

export function cssColorToHex(value?: string, backdrop?: string): string | undefined {
  const parsed = parseCssColor(value);
  if (!parsed) {
    return undefined;
  }
  const resolved = blendColorOverBackdrop(parsed, backdrop);
  const toHex = (channel: number): string => Math.round(channel * 255).toString(16).padStart(2, '0').toUpperCase();
  return `${toHex(resolved.red)}${toHex(resolved.green)}${toHex(resolved.blue)}`;
}

export function cssColorToTransparency(value?: string): number | undefined {
  const color = parseCssColor(value);
  if (!color || color.alpha === undefined) {
    return undefined;
  }
  return Math.round((1 - Math.max(0, Math.min(1, color.alpha))) * 100);
}

export function colorTokenCount(value?: string): number {
  if (!value) {
    return 0;
  }

  const matches = value.match(/rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8}/gi);
  return matches?.length ?? 0;
}

export function firstColorToken(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.match(/rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8}/i)?.[0];
}

export function isTransparent(value?: string): boolean {
  return !value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)';
}

export function pxToPt(value: number): number {
  return Math.round((value * 72 / 96) * 1000) / 1000;
}

export function pxToInches(value: number): number {
  return Math.round((value / 96) * 1000) / 1000;
}

export function isEmojiOnlyText(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && /^[\p{Extended_Pictographic}\uFE0F\u200D]+$/u.test(trimmed);
}

export function sanitizeFontFamily(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  return value
    .split(',')[0]
    ?.replace(/['"]/g, '')
    .trim() || undefined;
}

export function inferImageMimeType(source: string): string {
  if (source.startsWith('data:')) {
    return source.slice(5, source.indexOf(';'));
  }

  switch (path.extname(source).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'image/png';
  }
}
