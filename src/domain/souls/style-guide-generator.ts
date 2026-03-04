/**
 * Style Guide Generator for Design Souls.
 *
 * Produces a comprehensive markdown-formatted style guide (~2000 words)
 * from a SoulLayers object. The guide embeds actual token values so
 * an LLM can understand the design system without inspecting CSS.
 */

import type { SoulLayers } from '../../types/design-soul.js';

// ── Main Export ──────────────────────────────────────────────────

/**
 * Generate a comprehensive markdown style guide from soul layers.
 *
 * The guide covers token quick reference, layout patterns, typography
 * hierarchy, color usage, visual flourishes, do/don't rules, and
 * component patterns. All actual values from the layers are embedded
 * so the consuming LLM has complete context.
 *
 * @param layers - The seven design layers of a soul
 * @param tokenNames - Array of all CSS custom property names generated
 * @returns A markdown-formatted string (~2000 words)
 */
export function generateStyleGuide(layers: SoulLayers, tokenNames: string[]): string {
  const { color, typography, spacing, shape, depth, components, motion } = layers;

  // Group token names by prefix for the quick reference
  const colorTokens = tokenNames.filter((t) => t.startsWith('--color-'));
  const typographyTokens = tokenNames.filter(
    (t) => t.startsWith('--font-') || t.startsWith('--text-') || t.startsWith('--weight-') || t.startsWith('--line-height-') || t.startsWith('--letter-spacing-'),
  );
  const spacingTokens = tokenNames.filter((t) => t.startsWith('--space-'));
  const shapeTokens = tokenNames.filter((t) => t.startsWith('--radius-'));
  const depthTokens = tokenNames.filter((t) => t.startsWith('--shadow-') || t.startsWith('--border-'));
  const componentTokens = tokenNames.filter(
    (t) => t.startsWith('--card-') || t.startsWith('--button-') || t.startsWith('--input-') || t.startsWith('--badge-'),
  );
  const motionTokens = tokenNames.filter((t) => t.startsWith('--duration-') || t.startsWith('--easing-'));

  return `# Style Guide

> Design north star: ${motion.northStar}

This guide describes the complete visual system for slide generation. Every value references a CSS custom property (design token) so slides automatically adapt when the soul changes. Use \`var(--token-name)\` in all CSS — never hard-code colors, sizes, or fonts.

---

## Token Quick Reference

### Colors (${colorTokens.length} tokens)
| Purpose | Value | Token |
|---------|-------|-------|
| Canvas (slide background) | \`${color.canvas}\` | \`var(--color-canvas)\` |
| Surface (card/container bg) | \`${color.surface}\` | \`var(--color-surface)\` |
| Surface Alt (secondary bg) | \`${color.surfaceAlt}\` | \`var(--color-surface-alt)\` |
| Border | \`${color.border}\` | \`var(--color-border)\` |
| Text Primary | \`${color.textPrimary}\` | \`var(--color-text-primary)\` |
| Text Secondary | \`${color.textSecondary}\` | \`var(--color-text-secondary)\` |
| Text Tertiary | \`${color.textTertiary}\` | \`var(--color-text-tertiary)\` |
| Text Inverse | \`${color.textInverse}\` | \`var(--color-text-inverse)\` |
| Accent Primary | \`${color.accentPrimary}\` | \`var(--color-accent-primary)\` |
| Accent Secondary | \`${color.accentSecondary}\` | \`var(--color-accent-secondary)\` |
| Accent Warm | \`${color.accentWarm}\` | \`var(--color-accent-warm)\` |
| Success | \`${color.success}\` | \`var(--color-success)\` |
| Warning | \`${color.warning}\` | \`var(--color-warning)\` |
| Error | \`${color.error}\` | \`var(--color-error)\` |
| Info | \`${color.info}\` | \`var(--color-info)\` |

### Typography (${typographyTokens.length} tokens)
| Purpose | Value | Token |
|---------|-------|-------|
| Display font | \`${typography.fontDisplay}\` | \`var(--font-display)\` |
| Body font | \`${typography.fontBody}\` | \`var(--font-body)\` |
| Mono font | \`${typography.fontMono}\` | \`var(--font-mono)\` |
| Hero size | \`${typography.sizeHero}px\` | \`var(--text-hero)\` |
| H1 size | \`${typography.sizeH1}px\` | \`var(--text-h1)\` |
| H2 size | \`${typography.sizeH2}px\` | \`var(--text-h2)\` |
| H3 size | \`${typography.sizeH3}px\` | \`var(--text-h3)\` |
| Body size | \`${typography.sizeBody}px\` | \`var(--text-body)\` |
| Label size | \`${typography.sizeLabel}px\` | \`var(--text-label)\` |
| Caption size | \`${typography.sizeCaption}px\` | \`var(--text-caption)\` |
| Weight Normal | \`${typography.weightNormal}\` | \`var(--weight-normal)\` |
| Weight Medium | \`${typography.weightMedium}\` | \`var(--weight-medium)\` |
| Weight Bold | \`${typography.weightBold}\` | \`var(--weight-bold)\` |
| Heading line-height | \`${typography.lineHeightHeading}\` | \`var(--line-height-heading)\` |
| Body line-height | \`${typography.lineHeightBody}\` | \`var(--line-height-body)\` |
| Heading letter-spacing | \`${typography.letterSpacingHeading}\` | \`var(--letter-spacing-heading)\` |
| Body letter-spacing | \`${typography.letterSpacingBody}\` | \`var(--letter-spacing-body)\` |

### Spacing (${spacingTokens.length} tokens)
| Purpose | Value | Token |
|---------|-------|-------|
| Base unit | \`${spacing.baseUnit}px\` | \`var(--space-base)\` |
| XS | \`${spacing.xs}px\` | \`var(--space-xs)\` |
| SM | \`${spacing.sm}px\` | \`var(--space-sm)\` |
| MD | \`${spacing.md}px\` | \`var(--space-md)\` |
| LG | \`${spacing.lg}px\` | \`var(--space-lg)\` |
| XL | \`${spacing.xl}px\` | \`var(--space-xl)\` |
| XXL | \`${spacing.xxl}px\` | \`var(--space-xxl)\` |
| XXXL | \`${spacing.xxxl}px\` | \`var(--space-xxxl)\` |
| Safe area inset | \`${spacing.safeAreaInset}px\` | \`var(--space-safe-area)\` |

### Shape & Radius (${shapeTokens.length} tokens)
| Purpose | Value | Token |
|---------|-------|-------|
| None | \`${shape.none}\` | \`var(--radius-none)\` |
| SM | \`${shape.sm}\` | \`var(--radius-sm)\` |
| MD | \`${shape.md}\` | \`var(--radius-md)\` |
| LG | \`${shape.lg}\` | \`var(--radius-lg)\` |
| XL | \`${shape.xl}\` | \`var(--radius-xl)\` |
| Full (pill) | \`${shape.full}\` | \`var(--radius-full)\` |
| Button | \`${shape.buttonRadius}\` | \`var(--radius-button)\` |
| Card | \`${shape.cardRadius}\` | \`var(--radius-card)\` |
| Input | \`${shape.inputRadius}\` | \`var(--radius-input)\` |
| Badge | \`${shape.badgeRadius}\` | \`var(--radius-badge)\` |

### Depth & Shadow (${depthTokens.length} tokens)
| Purpose | Value | Token |
|---------|-------|-------|
| Shadow None | \`${depth.shadowNone}\` | \`var(--shadow-none)\` |
| Shadow Soft | \`${depth.shadowSoft}\` | \`var(--shadow-soft)\` |
| Shadow Medium | \`${depth.shadowMedium}\` | \`var(--shadow-medium)\` |
| Shadow Elevated | \`${depth.shadowElevated}\` | \`var(--shadow-elevated)\` |
| Shadow Inner | \`${depth.shadowInner}\` | \`var(--shadow-inner)\` |
| Border width | \`${depth.borderWidth}\` | \`var(--border-width)\` |
| Border opacity | \`${depth.borderOpacity}\` | \`var(--border-opacity)\` |

### Component Tokens (${componentTokens.length} tokens)
| Purpose | Value | Token |
|---------|-------|-------|
| Card padding | \`${components.cardPadding}\` | \`var(--card-padding)\` |
| Card shadow | \`${components.cardShadow}\` | \`var(--card-shadow)\` |
| Card border width | \`${components.cardBorderWidth}\` | \`var(--card-border-width)\` |
| Button padding X | \`${components.buttonPaddingX}\` | \`var(--button-padding-x)\` |
| Button padding Y | \`${components.buttonPaddingY}\` | \`var(--button-padding-y)\` |
| Input padding X | \`${components.inputPaddingX}\` | \`var(--input-padding-x)\` |
| Input padding Y | \`${components.inputPaddingY}\` | \`var(--input-padding-y)\` |
| Input border width | \`${components.inputBorderWidth}\` | \`var(--input-border-width)\` |
| Badge padding X | \`${components.badgePaddingX}\` | \`var(--badge-padding-x)\` |
| Badge padding Y | \`${components.badgePaddingY}\` | \`var(--badge-padding-y)\` |

### Motion & Timing (${motionTokens.length} tokens)
| Purpose | Value | Token |
|---------|-------|-------|
| Duration Fast | \`${motion.durationFast}\` | \`var(--duration-fast)\` |
| Duration Normal | \`${motion.durationNormal}\` | \`var(--duration-normal)\` |
| Duration Slow | \`${motion.durationSlow}\` | \`var(--duration-slow)\` |
| Easing Default | \`${motion.easingDefault}\` | \`var(--easing-default)\` |
| Easing Emphasized | \`${motion.easingEmphasized}\` | \`var(--easing-emphasized)\` |

---

## Layout Patterns

The slide canvas is **1920x1080px** with a safe area inset of **${spacing.safeAreaInset}px** on all sides. Use utility classes to compose layouts — avoid writing custom CSS when a utility class exists.

### Title Slide
Center content vertically with \`.flex-center .flex-col .full-height\`. Use \`.text-hero\` for the main title, \`.label .text-accent\` for category tags above the title, and \`.text-h3 .text-secondary\` for subtitles below. Add a bottom bar with \`.flex-between\` positioned absolutely at the bottom of the safe area for author and date in \`.caption\`.

### Two-Column
Use a flex container with two children. The left column (~60% width) holds text content: a \`.label .text-accent\` section label, \`.text-h1\` heading, and body-sized description. The right column (~40%) contains a visual area — use \`.card\` or \`.card-glass\` for content blocks. Use \`gap: var(--space-xl)\` between columns.

### Metrics Dashboard
Start with a \`.section-header\` containing a \`.label .text-accent\` section label and \`.text-h2\` heading. Below, use \`.grid-3\` for metric cards. Each card uses \`.card\` with a \`.text-hero .text-accent\` number, \`.text-h3\` label, and \`.text-secondary\` description. Cards should use \`.flex-col\` for internal layout.

### Features Grid
Same header pattern as Metrics. Use \`.grid-3\` for feature cards. Each card has an \`.icon-container\` at the top, a \`.text-h3\` title, body-text description, and a \`.badge\` tag at the bottom. Cards use \`.card .flex-col .gap-sm\` for layout.

### Closing CTA
Centered layout with \`.flex-center .flex-col .full-height\` and \`text-align: center\`. Stack: optional icon area, \`.text-h1\` heading, body-text description (max-width ~60%), and a button row with \`.btn .btn-primary\` and \`.btn .btn-secondary\` side by side with \`.gap-md\`.

### Blank Themed
Minimal canvas with only the theme tokens applied. The slide has the canvas background, body font, and safe area padding. Add content freely using any combination of utility classes. A subtle page number in \`.caption\` can sit at the bottom-right.

---

## Typography Hierarchy

Use the display font (\`${typography.fontDisplay}\`) for headings and the body font (\`${typography.fontBody}\`) for running text. The mono font (\`${typography.fontMono}\`) is reserved for labels, tags, and code.

- **Hero** (\`${typography.sizeHero}px\`, weight ${typography.weightBold}): Opening slides, single powerful statements. One per slide maximum. Use \`.text-hero\`.
- **H1** (\`${typography.sizeH1}px\`, weight ${typography.weightBold}): Primary slide headings. One per slide. Use \`.text-h1\`.
- **H2** (\`${typography.sizeH2}px\`, weight ${typography.weightBold}): Section headings, secondary emphasis on content-heavy slides. Use \`.text-h2\`.
- **H3** (\`${typography.sizeH3}px\`, weight ${typography.weightMedium}): Card titles, sub-sections, supporting headings. Use \`.text-h3\`.
- **Body** (\`${typography.sizeBody}px\`, weight ${typography.weightNormal}): Descriptions, paragraphs, longer text. Default for the slide.
- **Label** (\`${typography.sizeLabel}px\`, weight ${typography.weightMedium}): Categories, section markers, tags. Always uppercase with mono font. Use \`.label\`.
- **Caption** (\`${typography.sizeCaption}px\`): Footnotes, attributions, page numbers. Muted color. Use \`.caption\`.

Heading line-height is \`${typography.lineHeightHeading}\` (tight), body line-height is \`${typography.lineHeightBody}\` (comfortable). Heading letter-spacing is \`${typography.letterSpacingHeading}\`, body is \`${typography.letterSpacingBody}\`.

---

## Color Usage

### Semantic Meaning
- **Canvas** (\`${color.canvas}\`): The slide background. Always set on the root \`.slide\` element.
- **Surface** (\`${color.surface}\`): Card and container backgrounds. Provides subtle lift from canvas.
- **Surface Alt** (\`${color.surfaceAlt}\`): Secondary containers, icon backgrounds, badge fills.
- **Border** (\`${color.border}\`): Card outlines, dividers, separators.
- **Text Primary** (\`${color.textPrimary}\`): Main body text and headings.
- **Text Secondary** (\`${color.textSecondary}\`): Subtitles, descriptions, supporting text.
- **Text Tertiary** (\`${color.textTertiary}\`): Captions, footnotes, metadata.
- **Text Inverse** (\`${color.textInverse}\`): Text on dark or accent backgrounds.
- **Accent Primary** (\`${color.accentPrimary}\`): Key numbers, CTAs, highlights, links. The main brand color.
- **Accent Secondary** (\`${color.accentSecondary}\`): Secondary highlights, hover states, supporting accents.
- **Accent Warm** (\`${color.accentWarm}\`): Warm accent for variety — charts, tags, alternative emphasis.
- **Success** (\`${color.success}\`): Positive metrics, confirmations, growth indicators.
- **Warning** (\`${color.warning}\`): Caution states, attention-needed indicators.
- **Error** (\`${color.error}\`): Negative metrics, critical alerts.
- **Info** (\`${color.info}\`): Informational highlights, neutral callouts.

### Transparency with color-mix()
Use CSS \`color-mix()\` for semi-transparent tints without introducing new colors:
- \`color-mix(in srgb, var(--color-accent-primary) 20%, transparent)\` for subtle tinted backgrounds
- \`color-mix(in srgb, var(--color-surface) 60%, transparent)\` for glass-morphism overlays
- \`color-mix(in srgb, var(--color-border) 50%, transparent)\` for softer borders

Never hard-code hex, rgb, or hsl values. Always reference tokens.

---

## Visual Flourishes

### Gradient Blobs
Add \`.gradient-blob\` to a container for a soft radial gradient background effect. The blob uses the accent primary color at 30% opacity with a 60px blur, creating an ambient glow. Works best on full-height sections or behind card groups.

### Glass Morphism
Use \`.card-glass\` for frosted-glass containers that let background patterns bleed through. The effect combines a semi-transparent surface color with a 12px backdrop blur. For standalone glass panels, use \`.glass\` (16px blur, 40% opacity). These work especially well when layered over gradient blobs or colored backgrounds.

### Decorative Dots
Add \`.decorative-dots\` to a section for a subtle dot-grid pattern overlay. The dots use the border color at 40% opacity, spaced at \`var(--space-lg)\` intervals (${spacing.lg}px). The pattern sits behind content via \`pointer-events: none\`. Best as a subtle texture on larger sections.

### Elevated Cards
Use \`.card-elevated\` when cards need more visual weight than the standard soft shadow. The elevated shadow (\`${depth.shadowElevated}\`) gives a pronounced lift effect. Use sparingly — typically for the primary card in a group or for hover states.

---

## Do / Don't Rules

### Do
${motion.doRules.map((r) => `- ${r}`).join('\n')}

### Don't
${motion.dontRules.map((r) => `- ${r}`).join('\n')}

---

## Component Patterns

### Cards
Three card variants are available:
- **\`.card\`**: Standard card with surface background, border, and soft shadow. Use for metric cards, feature cards, and content blocks.
- **\`.card-glass\`**: Frosted glass card with semi-transparent background and backdrop blur. Use when layered over colorful backgrounds.
- **\`.card-elevated\`**: High-emphasis card with elevated shadow and no border. Use for primary or featured content.

All cards use \`var(--card-padding)\` (\`${components.cardPadding}\`) and \`var(--radius-card)\` (\`${shape.cardRadius}\`).

### Badges & Pills
- **\`.badge\`**: Small, rectangular tag with surface-alt background and accent text. Use for category labels, status indicators, and feature tags. Uses caption-size text and badge radius (\`${shape.badgeRadius}\`).
- **\`.pill\`**: Fully rounded variant using \`var(--radius-full)\` (\`${shape.full}\`). Use for status pills, filter chips, and secondary labels.

### Buttons
- **\`.btn .btn-primary\`**: Primary action button with accent background (\`${color.accentPrimary}\`) and inverse text. Use for the main CTA on a slide.
- **\`.btn .btn-secondary\`**: Secondary action with surface background and border. Use alongside primary buttons for alternative actions.

Buttons use \`var(--button-padding-y)\` (\`${components.buttonPaddingY}\`) / \`var(--button-padding-x)\` (\`${components.buttonPaddingX}\`) and \`var(--radius-button)\` (\`${shape.buttonRadius}\`). Transitions use \`var(--duration-fast)\` (\`${motion.durationFast}\`) with \`var(--easing-default)\` (\`${motion.easingDefault}\`).

### Icon Containers
Use \`.icon-container\` for consistent icon presentation: a square container (\`var(--space-xl)\` = \`${spacing.xl}px\` each side) with surface-alt background, medium radius (\`${shape.md}\`), and accent-colored icon text at H3 size. Place at the top of feature cards or alongside text content.

---

## Spacing System

The spacing scale is built on a ${spacing.baseUnit}px base unit:

| Scale | Value | Token | Use for |
|-------|-------|-------|---------|
| XS | ${spacing.xs}px | \`var(--space-xs)\` | Tight gaps between related items |
| SM | ${spacing.sm}px | \`var(--space-sm)\` | Small gaps within components |
| MD | ${spacing.md}px | \`var(--space-md)\` | Default component spacing |
| LG | ${spacing.lg}px | \`var(--space-lg)\` | Grid gaps, section spacing |
| XL | ${spacing.xl}px | \`var(--space-xl)\` | Major section breaks |
| XXL | ${spacing.xxl}px | \`var(--space-xxl)\` | Large visual separation |
| XXXL | ${spacing.xxxl}px | \`var(--space-xxxl)\` | Maximum separation |

The safe area inset (\`${spacing.safeAreaInset}px\`) defines the minimum distance from slide edges for all content. This is automatically applied by the \`.slide\` container padding.`;
}
