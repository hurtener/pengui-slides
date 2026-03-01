/**
 * Skeleton Generator for Design Souls.
 *
 * Generates 6 skeleton HTML templates programmatically.
 * Each template is a complete HTML document that uses CSS custom
 * properties (design tokens) for all visual values.
 */

import type { SoulId } from '../../types/common.js';
import type { SkeletonTemplate, SkeletonTemplateType } from '../../types/design-soul.js';
import type { Clock } from '../../infrastructure/clock.js';
import { generateTemplateId } from '../../infrastructure/id-generator.js';

// ── Template Metadata ───────────────────────────────────────────

interface TemplateSpec {
  type: SkeletonTemplateType;
  name: string;
  description: string;
  buildBody: () => string;
  buildStyles: () => string;
}

// ── HTML Helpers ────────────────────────────────────────────────

function slot(name: string, defaultContent: string): string {
  return `<!-- @slot:${name} -->${defaultContent}<!-- @endslot -->`;
}

const SLIDE_META = '<!-- @slide-meta -->';

const RESET_STYLES = `* {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }`;

const SLIDE_BASE_STYLES = `.slide {
      width: 1920px;
      height: 1080px;
      padding: var(--space-safe-area);
      background: var(--color-canvas);
      color: var(--color-text-primary);
      font-family: var(--font-body);
      font-size: var(--text-body);
      font-weight: var(--weight-normal);
      line-height: var(--line-height-body);
      letter-spacing: var(--letter-spacing-body);
      overflow: hidden;
      position: relative;
    }`;

function wrapDocument(cssTokens: string, extraStyles: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    ${cssTokens}

    ${RESET_STYLES}

    ${SLIDE_BASE_STYLES}

    ${extraStyles}
  </style>
</head>
<body>
  ${SLIDE_META}
  <div class="slide">
    ${body}
  </div>
</body>
</html>`;
}

// ── Template Builders ───────────────────────────────────────────

function titleSlideStyles(): string {
  return `.slide-inner {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      text-align: center;
    }

    .tag {
      font-family: var(--font-mono);
      font-size: var(--text-label);
      font-weight: var(--weight-medium);
      color: var(--color-accent-primary);
      letter-spacing: var(--letter-spacing-heading);
      text-transform: uppercase;
      margin-bottom: var(--space-md);
    }

    .title {
      font-family: var(--font-display);
      font-size: var(--text-hero);
      font-weight: var(--weight-bold);
      line-height: var(--line-height-heading);
      letter-spacing: var(--letter-spacing-heading);
      color: var(--color-text-primary);
      margin-bottom: var(--space-lg);
      max-width: 80%;
    }

    .subtitle {
      font-size: var(--text-h3);
      font-weight: var(--weight-normal);
      color: var(--color-text-secondary);
      max-width: 60%;
      margin-bottom: var(--space-xxl);
    }

    .bottom-bar {
      position: absolute;
      bottom: var(--space-safe-area);
      left: var(--space-safe-area);
      right: var(--space-safe-area);
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: var(--color-text-tertiary);
      font-size: var(--text-caption);
    }`;
}

function titleSlideBody(): string {
  return `<div class="slide-inner">
      <div class="tag">${slot('tag', 'Category')}</div>
      <h1 class="title">${slot('title', 'Presentation Title')}</h1>
      <p class="subtitle">${slot('subtitle', 'A compelling subtitle that sets the context for your presentation.')}</p>
    </div>
    <div class="bottom-bar">
      <span>${slot('author', 'Author Name')}</span>
      <span>${slot('date', 'March 2026')}</span>
    </div>`;
}

function twoColumnStyles(): string {
  return `.columns {
      display: flex;
      gap: var(--space-xl);
      height: 100%;
    }

    .col-left {
      flex: 0 0 60%;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .col-right {
      flex: 0 0 calc(40% - var(--space-xl));
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .section-label {
      font-family: var(--font-mono);
      font-size: var(--text-label);
      font-weight: var(--weight-medium);
      color: var(--color-accent-primary);
      text-transform: uppercase;
      letter-spacing: var(--letter-spacing-heading);
      margin-bottom: var(--space-sm);
    }

    .heading {
      font-family: var(--font-display);
      font-size: var(--text-h1);
      font-weight: var(--weight-bold);
      line-height: var(--line-height-heading);
      letter-spacing: var(--letter-spacing-heading);
      color: var(--color-text-primary);
      margin-bottom: var(--space-md);
    }

    .description {
      font-size: var(--text-body);
      color: var(--color-text-secondary);
      line-height: var(--line-height-body);
      max-width: 90%;
    }

    .content-area {
      width: 100%;
      height: 80%;
      background: var(--color-surface);
      border-radius: var(--radius-card);
      border: var(--border-width) solid var(--color-border);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-tertiary);
      font-size: var(--text-label);
    }`;
}

function twoColumnBody(): string {
  return `<div class="columns">
      <div class="col-left">
        <div class="section-label">${slot('sectionLabel', 'Section')}</div>
        <h2 class="heading">${slot('heading', 'Main Heading')}</h2>
        <p class="description">${slot('description', 'A detailed description that explains this section of the presentation. This area supports longer-form text content.')}</p>
      </div>
      <div class="col-right">
        <div class="content-area">
          ${slot('content', 'Content Area')}
        </div>
      </div>
    </div>`;
}

function metricsStyles(): string {
  return `.header {
      margin-bottom: var(--space-xl);
    }

    .section-label {
      font-family: var(--font-mono);
      font-size: var(--text-label);
      font-weight: var(--weight-medium);
      color: var(--color-accent-primary);
      text-transform: uppercase;
      letter-spacing: var(--letter-spacing-heading);
      margin-bottom: var(--space-sm);
    }

    .heading {
      font-family: var(--font-display);
      font-size: var(--text-h2);
      font-weight: var(--weight-bold);
      line-height: var(--line-height-heading);
      letter-spacing: var(--letter-spacing-heading);
      color: var(--color-text-primary);
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-lg);
      flex: 1;
    }

    .metric-card {
      background: var(--color-surface);
      border-radius: var(--radius-card);
      padding: var(--card-padding);
      border: var(--border-width) solid var(--color-border);
      box-shadow: var(--shadow-soft);
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .metric-number {
      font-family: var(--font-display);
      font-size: var(--text-hero);
      font-weight: var(--weight-bold);
      line-height: var(--line-height-heading);
      color: var(--color-accent-primary);
      margin-bottom: var(--space-xs);
    }

    .metric-label {
      font-size: var(--text-h3);
      font-weight: var(--weight-medium);
      color: var(--color-text-primary);
      margin-bottom: var(--space-xs);
    }

    .metric-description {
      font-size: var(--text-body);
      color: var(--color-text-secondary);
      line-height: var(--line-height-body);
    }`;
}

function metricsBody(): string {
  return `<div class="header">
      <div class="section-label">${slot('sectionLabel', 'Metrics')}</div>
      <h2 class="heading">${slot('heading', 'Key Performance Indicators')}</h2>
    </div>
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-number">${slot('metric1Number', '99%')}</div>
        <div class="metric-label">${slot('metric1Label', 'Metric One')}</div>
        <p class="metric-description">${slot('metric1Description', 'Description of this metric and what it means.')}</p>
      </div>
      <div class="metric-card">
        <div class="metric-number">${slot('metric2Number', '2.5x')}</div>
        <div class="metric-label">${slot('metric2Label', 'Metric Two')}</div>
        <p class="metric-description">${slot('metric2Description', 'Description of this metric and what it means.')}</p>
      </div>
      <div class="metric-card">
        <div class="metric-number">${slot('metric3Number', '10M+')}</div>
        <div class="metric-label">${slot('metric3Label', 'Metric Three')}</div>
        <p class="metric-description">${slot('metric3Description', 'Description of this metric and what it means.')}</p>
      </div>
    </div>`;
}

function featuresGridStyles(): string {
  return `.header {
      margin-bottom: var(--space-xl);
    }

    .section-label {
      font-family: var(--font-mono);
      font-size: var(--text-label);
      font-weight: var(--weight-medium);
      color: var(--color-accent-primary);
      text-transform: uppercase;
      letter-spacing: var(--letter-spacing-heading);
      margin-bottom: var(--space-sm);
    }

    .heading {
      font-family: var(--font-display);
      font-size: var(--text-h2);
      font-weight: var(--weight-bold);
      line-height: var(--line-height-heading);
      letter-spacing: var(--letter-spacing-heading);
      color: var(--color-text-primary);
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-lg);
    }

    .feature-card {
      background: var(--color-surface);
      border-radius: var(--radius-card);
      padding: var(--card-padding);
      border: var(--border-width) solid var(--color-border);
      box-shadow: var(--shadow-soft);
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
    }

    .feature-icon {
      width: var(--space-xl);
      height: var(--space-xl);
      background: var(--color-surface-alt);
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--text-h3);
      color: var(--color-accent-primary);
    }

    .feature-title {
      font-family: var(--font-display);
      font-size: var(--text-h3);
      font-weight: var(--weight-bold);
      color: var(--color-text-primary);
      line-height: var(--line-height-heading);
    }

    .feature-description {
      font-size: var(--text-body);
      color: var(--color-text-secondary);
      line-height: var(--line-height-body);
    }

    .feature-pill {
      display: inline-block;
      align-self: flex-start;
      background: var(--color-surface-alt);
      color: var(--color-accent-primary);
      font-size: var(--text-caption);
      font-weight: var(--weight-medium);
      padding: var(--badge-padding-y) var(--badge-padding-x);
      border-radius: var(--radius-badge);
    }`;
}

function featuresGridBody(): string {
  return `<div class="header">
      <div class="section-label">${slot('sectionLabel', 'Features')}</div>
      <h2 class="heading">${slot('heading', 'What We Offer')}</h2>
    </div>
    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon">${slot('feature1Icon', '#')}</div>
        <div class="feature-title">${slot('feature1Title', 'Feature One')}</div>
        <p class="feature-description">${slot('feature1Description', 'A short description of this feature and its value.')}</p>
        <span class="feature-pill">${slot('feature1Tag', 'Tag')}</span>
      </div>
      <div class="feature-card">
        <div class="feature-icon">${slot('feature2Icon', '#')}</div>
        <div class="feature-title">${slot('feature2Title', 'Feature Two')}</div>
        <p class="feature-description">${slot('feature2Description', 'A short description of this feature and its value.')}</p>
        <span class="feature-pill">${slot('feature2Tag', 'Tag')}</span>
      </div>
      <div class="feature-card">
        <div class="feature-icon">${slot('feature3Icon', '#')}</div>
        <div class="feature-title">${slot('feature3Title', 'Feature Three')}</div>
        <p class="feature-description">${slot('feature3Description', 'A short description of this feature and its value.')}</p>
        <span class="feature-pill">${slot('feature3Tag', 'Tag')}</span>
      </div>
    </div>`;
}

function closingCtaStyles(): string {
  return `.cta-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      text-align: center;
    }

    .cta-icon {
      width: var(--space-xxl);
      height: var(--space-xxl);
      background: var(--color-surface-alt);
      border-radius: var(--radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--text-h1);
      color: var(--color-accent-primary);
      margin-bottom: var(--space-lg);
    }

    .cta-heading {
      font-family: var(--font-display);
      font-size: var(--text-h1);
      font-weight: var(--weight-bold);
      line-height: var(--line-height-heading);
      letter-spacing: var(--letter-spacing-heading);
      color: var(--color-text-primary);
      margin-bottom: var(--space-md);
    }

    .cta-description {
      font-size: var(--text-body);
      color: var(--color-text-secondary);
      line-height: var(--line-height-body);
      max-width: 60%;
      margin-bottom: var(--space-xl);
    }

    .cta-buttons {
      display: flex;
      gap: var(--space-md);
    }

    .btn {
      font-family: var(--font-body);
      font-size: var(--text-body);
      font-weight: var(--weight-medium);
      padding: var(--button-padding-y) var(--button-padding-x);
      border-radius: var(--radius-button);
      border: none;
      cursor: pointer;
      transition: all var(--duration-fast) var(--easing-default);
    }

    .btn-primary {
      background: var(--color-accent-primary);
      color: var(--color-text-inverse);
    }

    .btn-secondary {
      background: var(--color-surface);
      color: var(--color-text-primary);
      border: var(--border-width) solid var(--color-border);
    }`;
}

function closingCtaBody(): string {
  return `<div class="cta-wrapper">
      <div class="cta-icon">${slot('icon', '&rarr;')}</div>
      <h2 class="cta-heading">${slot('heading', 'Ready to Get Started?')}</h2>
      <p class="cta-description">${slot('description', 'Take the next step and see how we can help you achieve your goals.')}</p>
      <div class="cta-buttons">
        <button class="btn btn-primary">${slot('primaryButton', 'Get Started')}</button>
        <button class="btn btn-secondary">${slot('secondaryButton', 'Learn More')}</button>
      </div>
    </div>`;
}

function blankThemedStyles(): string {
  return `.page-number {
      position: absolute;
      bottom: var(--space-md);
      right: var(--space-safe-area);
      font-family: var(--font-mono);
      font-size: var(--text-caption);
      color: var(--color-text-tertiary);
    }`;
}

function blankThemedBody(): string {
  return `<div class="page-number">${slot('pageNumber', '1')}</div>`;
}

// ── Skeleton Generator Class ────────────────────────────────────

export class SkeletonGenerator {
  /**
   * Generate all 6 skeleton templates for a given soul.
   */
  generateAll(soulId: SoulId, cssTokens: string, clock: Clock): SkeletonTemplate[] {
    const specs: TemplateSpec[] = [
      {
        type: 'title-slide',
        name: 'Title Slide',
        description: 'Centered layout with tag, hero title, subtitle, and bottom bar with date.',
        buildStyles: titleSlideStyles,
        buildBody: titleSlideBody,
      },
      {
        type: 'two-column',
        name: 'Two Column',
        description: '60/40 flex split with section label, heading, and description on the left, content area on the right.',
        buildStyles: twoColumnStyles,
        buildBody: twoColumnBody,
      },
      {
        type: 'metrics',
        name: 'Metrics',
        description: 'Header with section label and heading, followed by a 3-column grid of metric cards.',
        buildStyles: metricsStyles,
        buildBody: metricsBody,
      },
      {
        type: 'features-grid',
        name: 'Features Grid',
        description: 'Header section with a 3-column grid of feature cards including icon, title, description, and pill tag.',
        buildStyles: featuresGridStyles,
        buildBody: featuresGridBody,
      },
      {
        type: 'closing-cta',
        name: 'Closing CTA',
        description: 'Vertically centered call-to-action with icon, heading, description, and two buttons.',
        buildStyles: closingCtaStyles,
        buildBody: closingCtaBody,
      },
      {
        type: 'blank-themed',
        name: 'Blank Themed',
        description: 'Empty slide container with only the CSS theme applied and a page number.',
        buildStyles: blankThemedStyles,
        buildBody: blankThemedBody,
      },
    ];

    const now = clock.now();

    return specs.map((spec) => ({
      id: generateTemplateId(),
      soulId,
      type: spec.type,
      name: spec.name,
      description: spec.description,
      html: wrapDocument(cssTokens, spec.buildStyles(), spec.buildBody()),
      createdAt: now,
    }));
  }
}
