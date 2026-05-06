import { describe, it, expect } from 'vitest';
import {
  FlowConnectorSchema,
  FlowNodeSchema,
  FlowStepSchema,
  SlideNodeSchema,
} from '../../../../src/domain/ir/nodes.js';
import {
  lintFlowDensity,
  MAX_RECOMMENDED_FLOW_STEPS,
} from '../../../../src/domain/ir/flow-density.js';
import { renderNode } from '../../../../src/domain/ir/compile/node-renderers.js';
import {
  getConnectorSvg,
  listConnectorNames,
} from '../../../../src/domain/ir/compile/connectors.js';

const minimalStep = (label: string) => ({ label: [{ text: label }] });

describe('FlowStepSchema', () => {
  it('accepts a minimal step (label only)', () => {
    const parsed = FlowStepSchema.parse(minimalStep('A'));
    expect(parsed.label).toHaveLength(1);
  });

  it('accepts accent + icon + badge', () => {
    const parsed = FlowStepSchema.parse({
      label: [{ text: 'Plan' }],
      accent: 'accent',
      icon: 'target',
      badge: '01',
    });
    expect(parsed.icon).toBe('target');
    expect(parsed.badge).toBe('01');
  });

  it('rejects badge longer than 16 chars', () => {
    expect(() =>
      FlowStepSchema.parse({
        label: [{ text: 'X' }],
        badge: 'this-is-far-too-long',
      }),
    ).toThrow();
  });

  it('rejects unknown icon name', () => {
    expect(() =>
      FlowStepSchema.parse({
        label: [{ text: 'X' }],
        icon: 'definitely-not-a-lucide-icon',
      }),
    ).toThrow();
  });

  it('rejects extra fields (strict)', () => {
    expect(() =>
      FlowStepSchema.parse({ label: [{ text: 'X' }], description: 'hi' }),
    ).toThrow();
  });
});

describe('FlowNodeSchema', () => {
  it('accepts a 2-step horizontal arrow flow', () => {
    const parsed = FlowNodeSchema.parse({
      type: 'flow',
      direction: 'horizontal',
      connector: 'arrow',
      steps: [minimalStep('A'), minimalStep('B')],
    });
    expect(parsed.steps).toHaveLength(2);
  });

  it('accepts each connector variant', () => {
    for (const connector of FlowConnectorSchema.options) {
      const parsed = FlowNodeSchema.parse({
        type: 'flow',
        direction: 'vertical',
        connector,
        steps: [minimalStep('A'), minimalStep('B')],
      });
      expect(parsed.connector).toBe(connector);
    }
  });

  it('rejects single-step flow (min 2)', () => {
    expect(() =>
      FlowNodeSchema.parse({
        type: 'flow',
        direction: 'horizontal',
        connector: 'arrow',
        steps: [minimalStep('only')],
      }),
    ).toThrow();
  });

  it('rejects unknown direction', () => {
    expect(() =>
      FlowNodeSchema.parse({
        type: 'flow',
        direction: 'diagonal',
        connector: 'arrow',
        steps: [minimalStep('A'), minimalStep('B')],
      }),
    ).toThrow();
  });

  it('flows through SlideNodeSchema discriminated union', () => {
    const parsed = SlideNodeSchema.parse({
      type: 'flow',
      direction: 'horizontal',
      connector: 'cycle',
      steps: [minimalStep('A'), minimalStep('B'), minimalStep('C')],
    });
    expect(parsed.type).toBe('flow');
  });
});

describe('FlowConnectorSchema', () => {
  it('declares exactly the 4 v4.17 connectors', () => {
    expect(FlowConnectorSchema.options.sort()).toEqual([
      'arrow',
      'arrow_dashed',
      'cycle',
      'plus',
    ]);
  });
});

describe('connector glyph registry', () => {
  it('returns SVG for every connector', () => {
    for (const name of FlowConnectorSchema.options) {
      const svg = getConnectorSvg(name);
      expect(svg).toMatch(/<svg\b/);
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('currentColor');
    }
  });

  it('listConnectorNames matches the schema enum', () => {
    expect(listConnectorNames().sort()).toEqual(FlowConnectorSchema.options.slice().sort());
  });
});

describe('renderNode — flow', () => {
  const baseFlow = {
    type: 'flow' as const,
    direction: 'horizontal' as const,
    connector: 'arrow' as const,
    steps: [
      { label: [{ text: 'Plan' }], accent: 'info' as const, icon: 'target' as const, badge: '01' },
      { label: [{ text: 'Build' }], accent: 'accent' as const, badge: '02' },
      { label: [{ text: 'Ship' }], accent: 'success' as const, badge: '03' },
    ],
  };

  it('emits an <ol> with direction + connector classes', () => {
    const html = renderNode(baseFlow, ['body', 0]);
    expect(html).toContain('class="pengui-flow pengui-flow-horizontal pengui-flow-connector-arrow"');
    expect(html.startsWith('<ol')).toBe(true);
    expect(html.endsWith('</ol>')).toBe(true);
  });

  it('emits one step pill per step + 1 connector between adjacent steps', () => {
    const html = renderNode(baseFlow, ['body', 0]);
    const stepCount = (html.match(/<li class="pengui-flow-step\b/g) ?? []).length;
    const connectorCount = (html.match(/<li class="pengui-flow-connector\b/g) ?? []).length;
    expect(stepCount).toBe(3);
    expect(connectorCount).toBe(2); // 3 steps → 2 connectors between
  });

  it('cycle connector adds a closing return-arrow after the last step', () => {
    const html = renderNode({ ...baseFlow, connector: 'cycle' }, ['body', 0]);
    const connectorCount = (html.match(/<li class="pengui-flow-connector\b/g) ?? []).length;
    expect(connectorCount).toBe(3); // 2 between + 1 closing return
    expect(html).toContain('pengui-flow-connector-return');
  });

  it('non-cycle connectors omit the return modifier', () => {
    const html = renderNode({ ...baseFlow, connector: 'arrow' }, ['body', 0]);
    expect(html).not.toContain('pengui-flow-connector-return');
  });

  it('vertical direction emits the vertical class', () => {
    const html = renderNode({ ...baseFlow, direction: 'vertical' }, ['body', 0]);
    expect(html).toContain('pengui-flow-vertical');
    expect(html).not.toContain('pengui-flow-horizontal');
  });

  it('step accent flows into the accent class', () => {
    const html = renderNode(baseFlow, ['body', 0]);
    expect(html).toContain('pengui-flow-step-accent-info');
    expect(html).toContain('pengui-flow-step-accent-accent');
    expect(html).toContain('pengui-flow-step-accent-success');
  });

  it('step without accent defaults to muted', () => {
    const html = renderNode(
      {
        type: 'flow',
        direction: 'horizontal',
        connector: 'arrow',
        steps: [{ label: [{ text: 'A' }] }, { label: [{ text: 'B' }] }],
      },
      ['body', 0],
    );
    expect(html).toContain('pengui-flow-step-accent-muted');
  });

  it('icon emits the curated lucide SVG inside .pengui-flow-step-icon', () => {
    const html = renderNode(baseFlow, ['body', 0]);
    expect(html).toContain('class="pengui-flow-step-icon"');
    expect(html).toContain('<svg');
  });

  it('badge emits a .pengui-flow-step-badge span when present', () => {
    const html = renderNode(baseFlow, ['body', 0]);
    expect(html).toContain('<span class="pengui-flow-step-badge">01</span>');
    expect(html).toContain('<span class="pengui-flow-step-badge">02</span>');
  });

  it('omits icon span when step has no icon', () => {
    const html = renderNode(
      {
        type: 'flow',
        direction: 'horizontal',
        connector: 'arrow',
        steps: [{ label: [{ text: 'A' }] }, { label: [{ text: 'B' }] }],
      },
      ['body', 0],
    );
    expect(html).not.toContain('pengui-flow-step-icon');
  });

  it('every step carries a data-ir-flow-step index', () => {
    const html = renderNode(baseFlow, ['body', 0]);
    expect(html).toContain('data-ir-flow-step="0"');
    expect(html).toContain('data-ir-flow-step="1"');
    expect(html).toContain('data-ir-flow-step="2"');
  });
});

describe('lintFlowDensity', () => {
  function makeFlow(stepCount: number) {
    return {
      type: 'flow' as const,
      direction: 'horizontal' as const,
      connector: 'arrow' as const,
      steps: Array.from({ length: stepCount }, (_, i) => ({ label: [{ text: `S${i + 1}` }] })),
    };
  }

  it('returns no warnings at the recommended ceiling', () => {
    const warnings = lintFlowDensity([makeFlow(MAX_RECOMMENDED_FLOW_STEPS)]);
    expect(warnings).toHaveLength(0);
  });

  it('warns when steps exceed the ceiling', () => {
    const warnings = lintFlowDensity([makeFlow(MAX_RECOMMENDED_FLOW_STEPS + 1)]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('flow-density-high');
    expect(warnings[0].stepCount).toBe(MAX_RECOMMENDED_FLOW_STEPS + 1);
    expect(warnings[0].path).toBe('body[0]');
  });

  it('walks into grid cells', () => {
    const warnings = lintFlowDensity([
      {
        type: 'grid',
        columns: 2,
        cells: [
          [makeFlow(3)],
          [makeFlow(8)],
        ],
      },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].path).toBe('body[0].cells[1][0]');
  });

  it('walks into two_column children', () => {
    const warnings = lintFlowDensity([
      {
        type: 'two_column',
        left: [makeFlow(3)],
        right: [makeFlow(9)],
      },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].path).toBe('body[0].right[0]');
  });

  it('walks into card body', () => {
    const warnings = lintFlowDensity([
      {
        type: 'card',
        body: [makeFlow(10)],
      },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].path).toBe('body[0].body[0]');
  });

  it('returns multiple warnings when multiple flows exceed', () => {
    const warnings = lintFlowDensity([makeFlow(8), makeFlow(3), makeFlow(12)]);
    expect(warnings).toHaveLength(2);
    expect(warnings.map((w) => w.path)).toEqual(['body[0]', 'body[2]']);
  });
});
