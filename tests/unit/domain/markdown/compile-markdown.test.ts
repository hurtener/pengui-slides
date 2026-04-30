import { describe, it, expect } from 'vitest';

import { compileMarkdown } from '../../../../src/domain/markdown/compile-markdown.js';
import { LeafSlideNodeSchema } from '../../../../src/domain/ir/nodes.js';

describe('compileMarkdown — block grammar', () => {
  it('compiles a single paragraph', () => {
    const { nodes, warnings } = compileMarkdown('A simple paragraph.');
    expect(warnings).toEqual([]);
    expect(nodes).toEqual([
      { type: 'prose', body: [{ text: 'A simple paragraph.' }] },
    ]);
  });

  it('paragraphs separated by a blank line become separate prose nodes', () => {
    const { nodes } = compileMarkdown('First paragraph.\n\nSecond paragraph.');
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ type: 'prose' });
    expect(nodes[1]).toMatchObject({ type: 'prose' });
  });

  it('preserves line breaks within a paragraph as newline runs', () => {
    const { nodes } = compileMarkdown('First line\nSecond line');
    expect(nodes).toEqual([
      {
        type: 'prose',
        body: [
          { text: 'First line' },
          { text: '\n' },
          { text: 'Second line' },
        ],
      },
    ]);
  });

  it.each([1, 2, 3, 4, 5, 6])('ATX heading h%d', (n) => {
    const md = '#'.repeat(n) + ' Heading text';
    const { nodes } = compileMarkdown(md);
    expect(nodes).toEqual([
      { type: 'heading', level: n, text: [{ text: 'Heading text' }] },
    ]);
  });

  it('heading immediately followed by paragraph emits two nodes', () => {
    const { nodes } = compileMarkdown('## Title\nBody line.');
    expect(nodes).toEqual([
      { type: 'heading', level: 2, text: [{ text: 'Title' }] },
      { type: 'prose', body: [{ text: 'Body line.' }] },
    ]);
  });

  it('bullet list — `-`, `*`, `+` all map to bullet style', () => {
    const { nodes } = compileMarkdown('- one\n* two\n+ three');
    expect(nodes).toEqual([
      {
        type: 'list',
        style: 'bullet',
        items: [
          [{ text: 'one' }],
          [{ text: 'two' }],
          [{ text: 'three' }],
        ],
      },
    ]);
  });

  it('numbered list', () => {
    const { nodes } = compileMarkdown('1. one\n2. two\n10. ten');
    expect(nodes).toEqual([
      {
        type: 'list',
        style: 'numbered',
        items: [[{ text: 'one' }], [{ text: 'two' }], [{ text: 'ten' }]],
      },
    ]);
  });

  it('checklist — `[ ]` / `[x]` / `[X]`', () => {
    const { nodes } = compileMarkdown('- [ ] todo\n- [x] done\n- [X] also done');
    expect(nodes).toEqual([
      {
        type: 'list',
        style: 'checklist',
        items: [
          [{ text: 'todo' }],
          [{ text: 'done' }],
          [{ text: 'also done' }],
        ],
      },
    ]);
  });

  it('switching list style starts a new list node', () => {
    const { nodes } = compileMarkdown('- bullet\n1. numbered');
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ type: 'list', style: 'bullet' });
    expect(nodes[1]).toMatchObject({ type: 'list', style: 'numbered' });
  });

  it('blockquote — single line', () => {
    const { nodes } = compileMarkdown('> Be water.');
    expect(nodes).toEqual([
      { type: 'quote', body: [{ text: 'Be water.' }] },
    ]);
  });

  it('blockquote — multi-line collapses with newline runs', () => {
    const { nodes } = compileMarkdown('> Line one\n> Line two\n> Line three');
    expect(nodes).toEqual([
      {
        type: 'quote',
        body: [
          { text: 'Line one' },
          { text: '\n' },
          { text: 'Line two' },
          { text: '\n' },
          { text: 'Line three' },
        ],
      },
    ]);
  });

  it.each(['---', '***', '___'])('divider — `%s`', (delim) => {
    const { nodes } = compileMarkdown(delim);
    expect(nodes).toEqual([{ type: 'divider' }]);
  });

  it('image with asset_id — alt becomes the alt field', () => {
    const { nodes, warnings } = compileMarkdown('![Pengui mascot](asset_abc)');
    expect(warnings).toEqual([]);
    expect(nodes).toEqual([
      { type: 'image', asset_id: 'asset_abc', alt: 'Pengui mascot' },
    ]);
  });

  it('image with empty alt drops the field', () => {
    const { nodes } = compileMarkdown('![](asset_abc)');
    expect(nodes).toEqual([{ type: 'image', asset_id: 'asset_abc' }]);
  });
});

describe('compileMarkdown — inline marks', () => {
  it('bold via `**`', () => {
    const { nodes } = compileMarkdown('Hello **world**');
    expect(nodes[0]).toMatchObject({
      type: 'prose',
      body: [{ text: 'Hello ' }, { text: 'world', bold: true }],
    });
  });

  it('bold via `__`', () => {
    const { nodes } = compileMarkdown('__loud__');
    expect((nodes[0] as { body: unknown[] }).body).toEqual([
      { text: 'loud', bold: true },
    ]);
  });

  it('italic via `*` and `_`', () => {
    const a = compileMarkdown('*nice*').nodes[0] as { body: unknown[] };
    const b = compileMarkdown('_also nice_').nodes[0] as { body: unknown[] };
    expect(a.body).toEqual([{ text: 'nice', italic: true }]);
    expect(b.body).toEqual([{ text: 'also nice', italic: true }]);
  });

  it('inline code disables nested marks', () => {
    const { nodes } = compileMarkdown('`**not bold**`');
    expect((nodes[0] as { body: unknown[] }).body).toEqual([
      { text: '**not bold**', code: true },
    ]);
  });

  it('strikethrough via `~~`', () => {
    const { nodes } = compileMarkdown('~~old~~');
    expect((nodes[0] as { body: unknown[] }).body).toEqual([
      { text: 'old', strike: true },
    ]);
  });

  it('link via `[label](href)`', () => {
    const { nodes } = compileMarkdown('[claude](https://claude.com)');
    expect((nodes[0] as { body: unknown[] }).body).toEqual([
      { text: 'claude', link: 'https://claude.com' },
    ]);
  });

  it('marks compose — bold + italic + link', () => {
    const { nodes } = compileMarkdown('**[*hot link*](https://x.com)**');
    const body = (nodes[0] as { body: unknown[] }).body;
    expect(body).toEqual([
      { text: 'hot link', bold: true, italic: true, link: 'https://x.com' },
    ]);
  });

  it('adjacent runs with identical marks merge', () => {
    const { nodes } = compileMarkdown('**a****b**');
    const body = (nodes[0] as { body: unknown[] }).body;
    expect(body).toEqual([{ text: 'ab', bold: true }]);
  });
});

describe('compileMarkdown — warnings + unsupported', () => {
  it('fenced code block emits warning + drops content', () => {
    const md = '```js\nconsole.log("hi")\n```';
    const { nodes, warnings } = compileMarkdown(md);
    expect(nodes).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe('fenced_code_skipped');
  });

  it('table emits warning + drops content', () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |';
    const { nodes, warnings } = compileMarkdown(md);
    expect(nodes).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe('table_skipped');
  });

  it('image-by-URL emits warning + skips line', () => {
    const { nodes, warnings } = compileMarkdown('![alt](https://example.com/x.png)');
    expect(nodes).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe('image_url_skipped');
  });

  it('raw HTML emits warning + skips line', () => {
    const { nodes, warnings } = compileMarkdown('<div>passthrough</div>');
    expect(nodes).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe('html_passthrough_skipped');
  });
});

describe('compileMarkdown — Zod round-trip', () => {
  // Every node we emit MUST validate against the discriminated leaf
  // union. A failure here means the App would reject the agent's
  // payload at the insert tool layer.
  it.each([
    '# Heading',
    'A paragraph with **bold** and *italic* and `code`.',
    '- one\n- two',
    '1. first\n2. second',
    '- [ ] todo\n- [x] done',
    '> wisdom',
    '---',
    '![mascot](asset_abc)',
  ])('payload validates: %s', (md) => {
    const { nodes } = compileMarkdown(md);
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      const r = LeafSlideNodeSchema.safeParse(node);
      if (!r.success) {
        // Surface the failing node + Zod issue in the test output.
        throw new Error(
          `Node ${JSON.stringify(node)} failed validation: ${JSON.stringify(r.error.issues)}`,
        );
      }
    }
  });
});

describe('compileMarkdown — composite document', () => {
  it('lands a realistic mixed document end-to-end', () => {
    const md = [
      '# Report',
      '',
      '## Highlights',
      '',
      'Q3 revenue beat **target** by *12%*.',
      '',
      '- Customer wins: 24',
      '- Churn: 3 logos',
      '',
      '> Best quarter on record.',
      '',
      '---',
      '',
      '![chart](asset_revenue_q3)',
    ].join('\n');
    const { nodes, warnings } = compileMarkdown(md);
    expect(warnings).toEqual([]);
    expect(nodes.map((n) => n.type)).toEqual([
      'heading',
      'heading',
      'prose',
      'list',
      'quote',
      'divider',
      'image',
    ]);
  });

  it('handles CRLF line endings', () => {
    const { nodes } = compileMarkdown('# A\r\n\r\nbody');
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ type: 'heading', level: 1 });
    expect(nodes[1]).toMatchObject({ type: 'prose' });
  });

  it('empty input yields empty output', () => {
    expect(compileMarkdown('')).toEqual({ nodes: [], warnings: [] });
    expect(compileMarkdown('   \n\n  \n')).toEqual({ nodes: [], warnings: [] });
  });
});
