import { afterAll, describe, expect, it } from 'vitest';
import { createContainer } from '../../../../src/container.js';
import { loadConfig } from '../../../../src/config.js';
import { makeValidSlideHtml, makeSlideIR, sampleSoulInput } from '../../../helpers/fixtures.js';

describe('SlideDocumentService', () => {
  const containers: ReturnType<typeof createContainer>[] = [];

  afterAll(async () => {
    await Promise.all(containers.map((container) => container.renderService.shutdown()));
  });

  it('compiles a supported slide into a canonical document', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const result = await container.slideDocumentService.compileSlideHtml(
      makeValidSlideHtml('Canonical text'),
      'rev-1',
    );

    expect(result.document).not.toBeNull();
    expect(result.issues).toHaveLength(0);
    expect(result.document?.elements.some((element) => element.kind === 'text')).toBe(true);
  }, 20000);

  it('folds simple textual pseudo-element content into the exported document', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    .slide { width: 1920px; height: 1080px; position: relative; background: #fff; }
    .chip::before { content: "• "; }
  </style>
</head>
<body>
  <div class="slide">
    <div class="chip">Blocked</div>
  </div>
</body>
</html>`;

    const result = await container.slideDocumentService.compileSlideHtml(html, 'rev-2');

    expect(result.document).not.toBeNull();
    expect(result.issues.some((issue) => issue.code === 'unsupported-pseudo-before')).toBe(false);
    const textElement = result.document?.elements.find((element) => element.kind === 'text');
    expect(textElement && 'text' in textElement ? textElement.text : '').toContain('• Blocked');
  }, 10000);

  it('preserves authored_ir sourceKind on editor open (no wasted lazy compilation)', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({ soulId: soul.id as string, title: 'Doc Deck' });

    const slide = await container.deckService.addSlide({
      deckId: deck.id as string,
      ir: makeSlideIR('Editor document'),
      metadata: {
        title: 'Doc Slide',
        type: 'content',
        narrative: 'Document-backed slide',
      },
    });

    const state = await container.editorService.getEditorState(deck.id as string, slide.id as string);

    // v4.5: opening an IR slide in the editor must NOT clobber sourceKind.
    // The IR tree is the canonical representation; the App reads slide.html
    // for preview. SlideDocument is only produced lazily for editable
    // export paths (export_pptx, export_google_slides).
    expect(state.selectedSlide.sourceKind).toBe('authored_ir');
    expect(state.selectedSlide.document).toBeNull();
    expect(state.selectedSlide.editableExportReady).toBe(true);
  }, 12000);

  it('marks flex-stretched badges so export can preserve full-width backgrounds', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    .slide { width: 1920px; height: 1080px; background: #111; padding: 48px; }
    .card { width: 592px; padding: 24px; display: flex; flex-direction: column; gap: 8px; background: #222; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; background: #f5f5f5; color: #a50034; font-size: 12px; }
  </style>
</head>
<body>
  <div class="slide">
    <div class="card">
      <span class="badge" data-edit-id="text-1">AGENTS</span>
    </div>
  </div>
</body>
</html>`;

    const result = await container.slideDocumentService.compileSlideHtml(html, 'rev-3');

    expect(result.document).not.toBeNull();
    expect(result.issues).toEqual([]);
    const badge = result.document?.elements.find((element) => element.kind === 'text');
    expect(badge?.kind).toBe('text');
    expect(badge?.style.stretchX).toBe(true);
  }, 10000);

  it('marks decorative pseudo-element visuals for background fallback', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      background: #111;
      overflow: hidden;
    }
    .slide::before {
      content: '';
      position: absolute;
      width: 480px;
      height: 480px;
      top: 80px;
      right: 120px;
      border-radius: 9999px;
      background: radial-gradient(circle, rgba(253, 49, 46, 0.28), transparent 70%);
      filter: blur(60px);
    }
    h1 {
      position: absolute;
      left: 120px;
      top: 120px;
      color: white;
      font-size: 72px;
    }
  </style>
</head>
<body>
  <div class="slide">
    <h1 data-edit-id="title">Glow</h1>
  </div>
</body>
</html>`;

    const result = await container.slideDocumentService.compileSlideHtml(html, 'rev-4');

    expect(result.document).not.toBeNull();
    expect(result.issues.some((issue) => issue.code === 'unsupported-root-pseudo-before-visual')).toBe(true);
    expect(result.document?.elements.some((element) => element.exportDisposition === 'background')).toBe(true);
  }, 10000);

  it('collapses a heading with an inline pengui-text-* span into one multi-run text element', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    .slide { width: 1920px; height: 1080px; position: relative; background: #fff; padding: 48px; }
    h1 { font-family: Inter, sans-serif; font-size: 64px; color: #111; margin: 0; }
    .pengui-text-accent-warm { color: #fd7e14; }
  </style>
</head>
<body>
  <div class="slide">
    <h1 data-edit-id="hero-title">The Art of <span class="pengui-text-accent-warm">Coffee Brewing</span></h1>
  </div>
</body>
</html>`;

    const result = await container.slideDocumentService.compileSlideHtml(html, 'rev-mixed');

    expect(result.document).not.toBeNull();
    const textElements = result.document?.elements.filter((element) => element.kind === 'text') ?? [];
    expect(textElements).toHaveLength(1);
    const heading = textElements[0];
    expect(heading.kind).toBe('text');
    if (heading.kind !== 'text') return;
    expect(heading.text).toBe('The Art of Coffee Brewing');
    expect(heading.paragraphs).toHaveLength(1);
    expect(heading.paragraphs[0].runs.length).toBeGreaterThanOrEqual(2);
    const colors = heading.paragraphs[0].runs.map((run) => run.color);
    expect(colors).toContain('rgb(17, 17, 17)');
    expect(colors).toContain('rgb(253, 126, 20)');
  }, 12000);

  it('emits <hr> as a line shape (not a rectangle)', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    .slide { width: 1920px; height: 1080px; position: relative; background: #fff; padding: 48px; }
    hr { border: 0; border-top: 1px solid #ddd; margin: 24px 0; width: 100%; }
  </style>
</head>
<body>
  <div class="slide">
    <hr />
  </div>
</body>
</html>`;

    const result = await container.slideDocumentService.compileSlideHtml(html, 'rev-hr');

    expect(result.document).not.toBeNull();
    const shapes = result.document?.elements.filter((element) => element.kind === 'shape') ?? [];
    expect(shapes.length).toBeGreaterThan(0);
    const hrShape = shapes.find((shape) => shape.kind === 'shape' && shape.shapeType === 'line');
    expect(hrShape).toBeDefined();
  }, 12000);

  it('emits ordered list items as numbered bullets and unordered as bullet bullets', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    .slide { width: 1920px; height: 1080px; position: relative; background: #fff; padding: 48px; }
    ul, ol { font-family: Inter, sans-serif; font-size: 18px; }
  </style>
</head>
<body>
  <div class="slide">
    <ul><li>Bullet one</li><li>Bullet two</li></ul>
    <ol><li>Step one</li><li>Step two</li></ol>
  </div>
</body>
</html>`;

    const result = await container.slideDocumentService.compileSlideHtml(html, 'rev-list-types');

    expect(result.document).not.toBeNull();
    const items = (result.document?.elements ?? []).filter((el) => el.kind === 'text');
    const bulletItems = items.filter((el) => el.kind === 'text' && el.text.startsWith('Bullet'));
    const numberedItems = items.filter((el) => el.kind === 'text' && el.text.startsWith('Step'));
    expect(bulletItems).toHaveLength(2);
    expect(numberedItems).toHaveLength(2);
    for (const item of bulletItems) {
      if (item.kind !== 'text') continue;
      expect(item.paragraphs[0].bullet?.type).toBe('bullet');
    }
    for (const item of numberedItems) {
      if (item.kind !== 'text') continue;
      expect(item.paragraphs[0].bullet?.type).toBe('number');
    }
  }, 12000);

  it('captures href on inline anchors as run.link', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    .slide { width: 1920px; height: 1080px; position: relative; background: #fff; padding: 48px; }
    p { font-family: Inter, sans-serif; font-size: 18px; }
    a { color: #228be6; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="slide">
    <p>See the <a href="https://example.com/docs">documentation</a> for details.</p>
  </div>
</body>
</html>`;

    const result = await container.slideDocumentService.compileSlideHtml(html, 'rev-link');

    expect(result.document).not.toBeNull();
    const para = (result.document?.elements ?? []).find((el) => el.kind === 'text');
    expect(para?.kind).toBe('text');
    if (para?.kind !== 'text') return;
    const linkRun = para.paragraphs[0].runs.find((run) => run.link);
    expect(linkRun).toBeDefined();
    expect(linkRun?.link).toBe('https://example.com/docs');
    expect(linkRun?.text).toContain('documentation');
  }, 12000);

  it('does not duplicate cell-internal inline color spans as floating text elements', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    .slide { width: 1920px; height: 1080px; position: relative; background: #fff; padding: 48px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: 8px 16px; border-bottom: 1px solid #ddd; }
    .pengui-text-error { color: #fa5252; }
  </style>
</head>
<body>
  <div class="slide">
    <table>
      <thead><tr><th>Step</th><th>Time</th></tr></thead>
      <tbody>
        <tr><td>Bloom</td><td>30s <span class="pengui-text-error">(critical)</span></td></tr>
        <tr><td>Pour</td><td>2:30</td></tr>
      </tbody>
    </table>
  </div>
</body>
</html>`;

    const result = await container.slideDocumentService.compileSlideHtml(html, 'rev-table');

    expect(result.document).not.toBeNull();
    const tables = result.document?.elements.filter((element) => element.kind === 'table') ?? [];
    expect(tables).toHaveLength(1);
    // The cell-internal span must NOT have been emitted as a separate text leaf.
    const textElements = result.document?.elements.filter((element) => element.kind === 'text') ?? [];
    const stray = textElements.find((el) => el.kind === 'text' && el.text.includes('critical'));
    expect(stray).toBeUndefined();
  }, 12000);

  it('bimodal grid: each grid cell becomes its own native text element with distinct x positions', async () => {
    // v4.8 bimodal contract: a 3-column grid in slide mode must export to
    // PPTX with three native text shapes laid out by Chromium — not a
    // single rasterized chunk, not a background fallback.
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    :root { --color-canvas: #fff; }
    html, body { margin: 0; padding: 0; }
    * { box-sizing: border-box; }
    .slide { width: 1920px; height: 1080px; padding: 48px; background: #fff; position: relative; display: flex; flex-direction: column; gap: 24px; font-family: Inter, sans-serif; color: #111; }
    .pengui-grid { display: grid; align-items: start; flex: 1 1 auto; min-height: 0; }
    .pengui-grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
    .pengui-gap-md { gap: 16px; }
    .pengui-grid-cell { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    p { margin: 0; font-size: 18px; }
  </style>
</head>
<body>
  <!-- @slide-meta {"title":"Grid","type":"content"} -->
  <div class="slide">
    <div class="pengui-grid pengui-grid-cols-3 pengui-gap-md">
      <div class="pengui-grid-cell"><p>Alpha</p></div>
      <div class="pengui-grid-cell"><p>Bravo</p></div>
      <div class="pengui-grid-cell"><p>Charlie</p></div>
    </div>
  </div>
</body>
</html>`;

    const result = await container.slideDocumentService.compileSlideHtml(html, 'rev-grid');

    expect(result.document).not.toBeNull();
    const textElements = (result.document?.elements ?? []).filter((el) => el.kind === 'text');
    const cellTexts = textElements.filter((el) =>
      el.kind === 'text' && ['Alpha', 'Bravo', 'Charlie'].includes(el.text.trim()),
    );
    expect(cellTexts).toHaveLength(3);
    // Each cell must be classified as native (not background fallback).
    for (const t of cellTexts) {
      expect(t.exportDisposition).not.toBe('background');
    }
    // Cells must be laid out left-to-right at distinct x positions.
    const xs = cellTexts
      .map((el) => (el.kind === 'text' ? el.x : 0))
      .sort((a, b) => a - b);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  }, 15000);

  it('snapshots a card as a single PNG image with text overlays (v4.18.1)', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    html, body { margin: 0; padding: 0; }
    * { box-sizing: border-box; }
    .slide { width: 1920px; height: 1080px; padding: 48px; background: #fff; position: relative; font-family: Inter, sans-serif; color: #111; }
    .pengui-card { display: flex; flex-direction: column; gap: 12px; padding: 24px; border: 1px solid #ddd; border-top: 3px solid #5b8def; border-radius: 8px; width: 400px; }
    .pengui-card-icon { color: #5b8def; }
    .pengui-card-icon svg { width: 24px; height: 24px; }
    h2, p { margin: 0; }
  </style>
</head>
<body>
  <div class="slide">
    <article class="pengui-card pengui-card-accent-info">
      <span class="pengui-card-icon"><svg viewBox="0 0 24 24"><path d="M3 12h18" stroke="currentColor" stroke-width="2"/></svg></span>
      <h2>Card heading</h2>
      <div class="pengui-card-body"><p>Body prose under the heading.</p></div>
    </article>
  </div>
</body>
</html>`;

    const result = await container.slideDocumentService.compileSlideHtml(html, 'rev-snap-card');

    expect(result.document).not.toBeNull();
    const elements = result.document?.elements ?? [];
    // Snapshot image: kind 'image' with a data:image/png src.
    const snapImage = elements.find((el) => el.kind === 'image' && el.src.startsWith('data:image/png;'));
    expect(snapImage, 'expected one PNG snapshot for the card').toBeDefined();
    // Text overlays: heading + body prose still emit as native text shapes.
    const textElements = elements.filter((el) => el.kind === 'text');
    const headingText = textElements.find((el) => el.kind === 'text' && el.text.trim() === 'Card heading');
    const bodyText = textElements.find((el) => el.kind === 'text' && el.text.includes('Body prose'));
    expect(headingText).toBeDefined();
    expect(bodyText).toBeDefined();
    // The card's structural rect (from the generic shape walker) should
    // NOT appear — the snapshot replaced it. Verify by checking no
    // shape element has the card's selector.
    const cardShape = elements.find((el) =>
      el.kind === 'shape' && (el.selector ?? '').toLowerCase().includes('pengui-card'),
    );
    expect(cardShape, 'card structural shape should be suppressed by the snapshot').toBeUndefined();
  }, 20000);
});
