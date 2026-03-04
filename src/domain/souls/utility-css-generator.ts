/**
 * Utility CSS Generator for Design Souls.
 *
 * Generates a static CSS utility class library where ALL values
 * reference design tokens via var(--token). Because every value
 * is a token reference, this function takes no arguments and
 * returns the same string regardless of which soul is active.
 */

// ── Main Export ──────────────────────────────────────────────────

/**
 * Generate the complete utility CSS class library.
 *
 * Returns ~38 utility classes covering layout, cards, typography,
 * backgrounds, decorative effects, components, and spacing.
 * All property values use `var(--token)` references so they
 * automatically adapt to whatever design soul tokens are in scope.
 */
export function generateUtilityCss(): string {
  return `/* Pengui Slides — Utility CSS Library */
/* All values reference design tokens via var(--token) */

/* ── Layout ──────────────────────────── */
.grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-lg); }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-lg); }
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-lg); }
.flex-center { display: flex; align-items: center; justify-content: center; }
.flex-col { display: flex; flex-direction: column; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.full-height { height: 100%; }

/* ── Cards ───────────────────────────── */
.card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: var(--card-padding);
  border: var(--border-width) solid var(--color-border);
  box-shadow: var(--shadow-soft);
}
.card-glass {
  background: color-mix(in srgb, var(--color-surface) 60%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: var(--radius-card);
  padding: var(--card-padding);
  border: var(--border-width) solid color-mix(in srgb, var(--color-border) 50%, transparent);
}
.card-elevated {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: var(--card-padding);
  box-shadow: var(--shadow-elevated);
}

/* ── Typography ──────────────────────── */
.text-hero { font-family: var(--font-display); font-size: var(--text-hero); font-weight: var(--weight-bold); line-height: var(--line-height-heading); letter-spacing: var(--letter-spacing-heading); }
.text-h1 { font-family: var(--font-display); font-size: var(--text-h1); font-weight: var(--weight-bold); line-height: var(--line-height-heading); letter-spacing: var(--letter-spacing-heading); }
.text-h2 { font-family: var(--font-display); font-size: var(--text-h2); font-weight: var(--weight-bold); line-height: var(--line-height-heading); letter-spacing: var(--letter-spacing-heading); }
.text-h3 { font-family: var(--font-display); font-size: var(--text-h3); font-weight: var(--weight-medium); line-height: var(--line-height-heading); }
.label { font-family: var(--font-mono); font-size: var(--text-label); font-weight: var(--weight-medium); text-transform: uppercase; letter-spacing: var(--letter-spacing-heading); }
.caption { font-size: var(--text-caption); color: var(--color-text-tertiary); }
.text-accent { color: var(--color-accent-primary); }
.text-secondary { color: var(--color-text-secondary); }
.text-inverse { color: var(--color-text-inverse); }

/* ── Backgrounds ─────────────────────── */
.bg-canvas { background: var(--color-canvas); }
.bg-surface { background: var(--color-surface); }
.bg-surface-alt { background: var(--color-surface-alt); }
.bg-dark { background: var(--color-text-primary); color: var(--color-text-inverse); }
.bg-accent { background: var(--color-accent-primary); color: var(--color-text-inverse); }

/* ── Decorative ──────────────────────── */
.gradient-blob {
  position: relative;
  overflow: hidden;
}
.gradient-blob::before {
  content: '';
  position: absolute;
  width: 50%;
  height: 50%;
  border-radius: var(--radius-full);
  background: radial-gradient(circle, color-mix(in srgb, var(--color-accent-primary) 30%, transparent), transparent 70%);
  filter: blur(60px);
  pointer-events: none;
}
.glass {
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background: color-mix(in srgb, var(--color-surface) 40%, transparent);
}
.decorative-dots {
  position: relative;
}
.decorative-dots::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, color-mix(in srgb, var(--color-border) 40%, transparent) 1px, transparent 1px);
  background-size: var(--space-lg) var(--space-lg);
  pointer-events: none;
}

/* ── Components ──────────────────────── */
.badge {
  display: inline-block;
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  padding: var(--badge-padding-y) var(--badge-padding-x);
  border-radius: var(--radius-badge);
  background: var(--color-surface-alt);
  color: var(--color-accent-primary);
}
.pill {
  display: inline-block;
  font-size: var(--text-label);
  font-weight: var(--weight-medium);
  padding: var(--badge-padding-y) var(--badge-padding-x);
  border-radius: var(--radius-full);
  background: var(--color-surface-alt);
  color: var(--color-text-secondary);
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
}
.icon-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--space-xl);
  height: var(--space-xl);
  border-radius: var(--radius-md);
  background: var(--color-surface-alt);
  color: var(--color-accent-primary);
  font-size: var(--text-h3);
}

/* ── Spacing ─────────────────────────── */
.section-header { margin-bottom: var(--space-xl); }
.gap-sm { gap: var(--space-sm); }
.gap-md { gap: var(--space-md); }
.gap-lg { gap: var(--space-lg); }`;
}
