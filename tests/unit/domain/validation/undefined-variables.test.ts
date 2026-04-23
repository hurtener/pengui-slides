import { describe, it, expect } from 'vitest';
import { UndefinedVariablesCheck } from '../../../../src/domain/validation/stage1/undefined-variables.js';

const check = new UndefinedVariablesCheck();

describe('UndefinedVariablesCheck', () => {
  it('passes when every referenced var() has a matching :root declaration', () => {
    const html = `
      <style>
        :root { --space-safe-area: 96px; --color-canvas: #FAF6EE; }
        .slide { padding: var(--space-safe-area); background: var(--color-canvas); }
      </style>
      <div class="slide"></div>`;
    const issues = check.run(html, [], []);
    expect(issues).toHaveLength(0);
  });

  it('flags a var() whose --name is not declared anywhere', () => {
    const html = `
      <style>
        :root { --color-canvas: #FAF6EE; }
        .slide { padding: var(--space-safe-area); }
      </style>
      <div class="slide"></div>`;
    const issues = check.run(html, [], []);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('--space-safe-area');
    expect(issues[0].severity).toBe('warning');
  });

  it('allows var() with a fallback even when --name is not declared', () => {
    const html = `
      <style>
        :root { --color-canvas: #FAF6EE; }
        .slide { padding: var(--space-safe-area, 96px); }
      </style>
      <div class="slide"></div>`;
    const issues = check.run(html, [], []);
    expect(issues).toHaveLength(0);
  });

  it('checks inline style="..." attributes', () => {
    const html = `
      <style>:root { --color-canvas: #FAF6EE; }</style>
      <div class="slide" style="padding: var(--space-safe-area); background: var(--color-canvas);"></div>`;
    const issues = check.run(html, [], []);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('--space-safe-area');
  });

  it('accepts declarations made in a [data-pengui-medium="print"] scope as defined', () => {
    const html = `
      <style>
        :root { --space-safe-area: 48px; }
        [data-pengui-medium="print"] { --space-safe-area: 96px; }
        .slide { padding: var(--space-safe-area); }
      </style>
      <div class="slide"></div>`;
    const issues = check.run(html, [], []);
    expect(issues).toHaveLength(0);
  });

  it('reports multiple distinct missing variables separately', () => {
    const html = `
      <style>
        :root { --color-canvas: #FAF6EE; }
        .slide { padding: var(--space-safe-area); color: var(--color-text-primary); }
      </style>
      <div class="slide"></div>`;
    const issues = check.run(html, [], []);
    expect(issues).toHaveLength(2);
    const names = issues.map((i) => i.message).join(' ');
    expect(names).toContain('--space-safe-area');
    expect(names).toContain('--color-text-primary');
  });
});
