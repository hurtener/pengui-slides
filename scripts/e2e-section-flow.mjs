#!/usr/bin/env node
/**
 * End-to-end driver for the v4.5 IR-first authoring flow.
 *
 * Connects to a running Pengui Slides MCP server on http://127.0.0.1:3030/mcp
 * and exercises:
 *  - the slide-ir / section-ir tool surface (add_slide, add_section,
 *    update_slide, update_section)
 *  - the validate_slide_ir / validate_section_ir schema-only validators
 *  - the pengui://schema/slide-ir resource
 *  - section-mutation contract for live App refresh
 *  - get_session → build_info
 *
 * Each step is asserted; non-zero exit on any failure.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const ENDPOINT = process.env.PENGUI_E2E_URL ?? 'http://127.0.0.1:3030/mcp';

const FAILS = [];
function check(name, cond, detail) {
  const status = cond ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) FAILS.push(name);
}

function payload(result) {
  if (result.structuredContent) return result.structuredContent;
  const item = result.content?.find((c) => c.type === 'text');
  if (!item) return null;
  try {
    return JSON.parse(item.text);
  } catch {
    return null;
  }
}

const SOUL_LAYERS = {
  color: {
    canvas: '#ffffff', surface: '#f8f9fa', surfaceAlt: '#e9ecef', border: '#dee2e6',
    textPrimary: '#212529', textSecondary: '#495057', textTertiary: '#868e96', textInverse: '#ffffff',
    accentPrimary: '#228be6', accentSecondary: '#15aabf', accentWarm: '#fd7e14',
    success: '#40c057', warning: '#fab005', error: '#fa5252', info: '#228be6',
  },
  typography: {
    fontDisplay: "'Inter', sans-serif", fontBody: "'Inter', sans-serif", fontMono: "'JetBrains Mono', monospace",
    sizeHero: 72, sizeH1: 48, sizeH2: 36, sizeH3: 28, sizeBody: 18, sizeLabel: 14, sizeCaption: 12,
    weightNormal: 400, weightMedium: 500, weightBold: 700,
    lineHeightHeading: 1.2, lineHeightBody: 1.6,
    letterSpacingHeading: '-0.02em', letterSpacingBody: '0em',
  },
  spacing: { baseUnit: 8, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64, safeAreaInset: 48 },
  shape: { none: '0', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px',
    buttonRadius: '8px', cardRadius: '12px', inputRadius: '6px', badgeRadius: '9999px' },
  depth: { shadowNone: 'none', shadowSoft: '0 1px 3px rgba(0,0,0,0.08)', shadowMedium: '0 4px 12px rgba(0,0,0,0.12)',
    shadowElevated: '0 8px 24px rgba(0,0,0,0.16)', shadowInner: 'inset 0 2px 4px rgba(0,0,0,0.06)',
    borderWidth: '1px', borderOpacity: 0.1 },
  components: {
    cardPadding: '24px', cardShadow: '0 1px 3px rgba(0,0,0,0.08)', cardBorderWidth: '1px',
    buttonPaddingX: '20px', buttonPaddingY: '10px',
    inputPaddingX: '12px', inputPaddingY: '8px', inputBorderWidth: '1px',
    badgePaddingX: '8px', badgePaddingY: '2px',
  },
  motion: {
    durationFast: '100ms', durationNormal: '200ms', durationSlow: '400ms',
    easingDefault: 'cubic-bezier(0.4, 0, 0.2, 1)', easingEmphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    northStar: 'Clean and professional',
    doRules: ['Use consistent spacing'], dontRules: ['No gradients'],
  },
};

const HERO_IR = (title) => ({
  body: [{ type: 'hero', title: [{ text: title }] }],
});

const PROSE_IR = (text) => ({
  body: [{ type: 'prose', body: [{ text }] }],
});

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT));
  const client = new Client({ name: 'pengui-e2e', version: '1.0.0' });
  await client.connect(transport);
  console.log(`connected to ${ENDPOINT}`);

  // 1. Soul: register + approve
  const soul = await client.callTool({
    name: 'register_design_soul',
    arguments: { name: 'E2E Soul', description: 'For end-to-end driver', layers: SOUL_LAYERS },
  });
  if (soul.isError) {
    console.error('register_design_soul errored:', JSON.stringify(payload(soul), null, 2));
    process.exit(1);
  }
  const soulId = payload(soul)?.soul_id;
  check('register_design_soul → soul_id', !!soulId, `id=${soulId}`);

  await client.callTool({ name: 'approve_design_soul', arguments: { soul_id: soulId } });

  // 2. pengui://schema/slide-ir resource is reachable
  const schemaRes = await client.readResource({ uri: 'pengui://schema/slide-ir' });
  const schemaText = schemaRes.contents?.[0]?.text;
  let schemaJson = null;
  try { schemaJson = JSON.parse(schemaText); } catch { /* fail below */ }
  check(
    'pengui://schema/slide-ir resource resolves and is JSON',
    !!schemaJson && Array.isArray(schemaJson.node_types),
    `node_types=${schemaJson?.node_types?.join(',')}`,
  );
  check(
    'schema enumerates the v4.5 leaf nodes',
    schemaJson?.node_types?.includes('hero')
      && schemaJson.node_types.includes('prose')
      && schemaJson.node_types.includes('image')
      && schemaJson.node_types.includes('callout')
      && schemaJson.node_types.includes('two_column'),
    `nodes=${schemaJson?.node_types?.join(',')}`,
  );

  // 3. Document deck flow
  const deck = await client.callTool({
    name: 'create_deck',
    arguments: { soul_id: soulId, format: 'print_a4_portrait', title: 'E2E Doc' },
  });
  if (deck.isError) {
    console.error('create_deck errored:', JSON.stringify(payload(deck), null, 2));
    process.exit(1);
  }
  const deckPayload = payload(deck);
  const deckId = deckPayload?.deck_id ?? deckPayload?.id;
  check('create_deck → deck_id', !!deckId, `id=${deckId}`);
  check(
    'create_deck defaults to authoring_model: document for print',
    deckPayload?.authoring_model === 'document',
  );

  // 4. add_section with section_ir
  const addSec = await client.callTool({
    name: 'add_section',
    arguments: {
      deck_id: deckId,
      kind: 'prose',
      section_ir: PROSE_IR('Hello from IR'),
      metadata: { title: 'Intro', narrative: 'first prose section' },
    },
  });
  if (addSec.isError) {
    console.error('add_section errored:', JSON.stringify(payload(addSec), null, 2));
  }
  const addSecP = payload(addSec);
  const sectionId = addSecP?.section_id;
  check('add_section accepts section_ir and returns section_id', !!sectionId);
  check(
    'add_section validation passes for a clean IR',
    addSecP?.validation?.passed === true,
    `errors=${addSecP?.validation?.error_count}`,
  );

  // 5. validate_section_ir — schema-only happy path
  const vSecOk = await client.callTool({
    name: 'validate_section_ir',
    arguments: { section_ir: PROSE_IR('valid') },
  });
  check('validate_section_ir passes a clean IR', payload(vSecOk)?.ok === true);

  const vSecBad = await client.callTool({
    name: 'validate_section_ir',
    arguments: { section_ir: { body: [{ type: 'unknown' }] } },
  });
  const vSecBadP = payload(vSecBad);
  check(
    'validate_section_ir rejects unknown node types with issue path',
    vSecBadP?.ok === false && Array.isArray(vSecBadP.issues) && vSecBadP.issues.length > 0,
  );

  // 6. update_section with new IR recompiles HTML
  const updSec = await client.callTool({
    name: 'update_section',
    arguments: {
      deck_id: deckId,
      section_id: sectionId,
      section_ir: PROSE_IR('Updated content'),
    },
  });
  const updSecP = payload(updSec);
  check(
    'update_section recompiles HTML from new IR',
    updSecP?.section_id === sectionId && updSecP?.validation?.passed === true,
  );

  // 7. Slide deck flow
  const slidesDeck = await client.callTool({
    name: 'create_deck',
    arguments: { soul_id: soulId, format: 'slides_16_9', title: 'E2E Slides' },
  });
  const slidesDeckId = payload(slidesDeck)?.deck_id ?? payload(slidesDeck)?.id;
  check('create_deck for slides_16_9 → deck_id', !!slidesDeckId);

  const addSlide = await client.callTool({
    name: 'add_slide',
    arguments: {
      deck_id: slidesDeckId,
      slide_ir: HERO_IR('Hello from IR'),
      metadata: { title: 'Hello', type: 'content', narrative: 'first slide' },
    },
  });
  if (addSlide.isError) {
    console.error('add_slide errored:', JSON.stringify(payload(addSlide), null, 2));
  }
  const addSlideP = payload(addSlide);
  const slideId = addSlideP?.slide_id;
  check('add_slide accepts slide_ir and returns slide_id', !!slideId);
  check(
    'add_slide reports source_kind=authored_ir',
    addSlideP?.source_kind === 'authored_ir',
    `source_kind=${addSlideP?.source_kind}`,
  );

  // 8. validate_slide_ir
  const vSlideOk = await client.callTool({
    name: 'validate_slide_ir',
    arguments: { slide_ir: HERO_IR('ok') },
  });
  check('validate_slide_ir passes a clean IR', payload(vSlideOk)?.ok === true);

  // 9. WRONG_AUTHORING_MODEL on cross-model calls
  const wrongModel = await client.callTool({
    name: 'add_slide',
    arguments: {
      deck_id: deckId,
      slide_ir: HERO_IR('x'),
      metadata: { title: 't', type: 'content', narrative: 'n' },
    },
  });
  check(
    'add_slide on document deck → WRONG_AUTHORING_MODEL',
    wrongModel.isError && payload(wrongModel)?.code === 'WRONG_AUTHORING_MODEL',
  );

  // 9b. v4.6: apply_slide_node_edit replaces one node in-place.
  const editedSlide = await client.callTool({
    name: 'apply_slide_node_edit',
    arguments: {
      deck_id: slidesDeckId,
      slide_id: slideId,
      path: ['body', 0],
      new_node: { type: 'hero', title: [{ text: 'Edited heading' }] },
    },
  });
  if (editedSlide.isError) {
    console.error('apply_slide_node_edit errored:', JSON.stringify(payload(editedSlide), null, 2));
  }
  const editedP = payload(editedSlide);
  check(
    'apply_slide_node_edit returns the patched slide_id',
    editedP?.slide_id === slideId,
  );
  // Confirm the edit propagated to slide.html.
  const refetched = await client.callTool({ name: 'get_slide', arguments: { deck_id: slidesDeckId, slide_id: slideId } });
  const refetchedHtml = payload(refetched)?.html ?? '';
  check(
    'apply_slide_node_edit recompiled slide.html with the new content',
    refetchedHtml.includes('Edited heading'),
  );

  // 9c. v4.6: apply_section_node_edit replaces a section IR node in-place.
  const editedSection = await client.callTool({
    name: 'apply_section_node_edit',
    arguments: {
      deck_id: deckId,
      section_id: sectionId,
      path: ['body', 0],
      new_node: { type: 'prose', body: [{ text: 'Edited section body' }] },
    },
  });
  const editedSecP = payload(editedSection);
  check(
    'apply_section_node_edit returns the patched section_id',
    editedSecP?.section_id === sectionId,
  );

  // 9d. v4.6: apply_token_override cascades a recompile to existing IR slides.
  const tokenOverride = await client.callTool({
    name: 'apply_token_override',
    arguments: { soul_ref: soulId, layer: 'color', token_name: 'accentPrimary', value: '#aa5500' },
  });
  if (tokenOverride.isError) {
    console.error('apply_token_override errored:', JSON.stringify(payload(tokenOverride), null, 2));
  }
  const tokenP = payload(tokenOverride);
  check(
    'apply_token_override returns recompile counts',
    typeof tokenP?.recompile?.slides_updated === 'number'
      && tokenP.recompile.slides_updated >= 1,
    `slides_updated=${tokenP?.recompile?.slides_updated}`,
  );
  const afterOverride = await client.callTool({ name: 'get_slide', arguments: { deck_id: slidesDeckId, slide_id: slideId } });
  const afterHtml = payload(afterOverride)?.html ?? '';
  check(
    'token override propagated to slide.html (--color-accent-primary updated)',
    afterHtml.includes('--color-accent-primary: #aa5500'),
  );

  // 10. Section-mutation contract: every section-mutating tool populates
  //     structuredContent with section_id or section_count.
  const SECTION_MUTATING_TOOL_NAMES = [
    'add_section', 'update_section', 'remove_section', 'reorder_sections',
    'apply_section_node_edit',
  ];
  function satisfiesContract(structuredContent) {
    if (!structuredContent || typeof structuredContent !== 'object') return false;
    const sid = structuredContent.section_id;
    const sc = structuredContent.section_count;
    return (typeof sid === 'string' && sid.length > 0) || (typeof sc === 'number' && sc >= 0);
  }
  const contractDeck = await client.callTool({
    name: 'create_deck',
    arguments: { soul_id: soulId, format: 'print_a4_portrait', title: 'Contract' },
  });
  const contractDeckId = payload(contractDeck)?.deck_id;
  const baseArgs = (title) => ({
    deck_id: contractDeckId,
    kind: 'prose',
    section_ir: PROSE_IR(title),
    metadata: { title, narrative: title },
  });
  const tracked = {};
  tracked.add_section = await client.callTool({ name: 'add_section', arguments: baseArgs('A') });
  const sec1Id = tracked.add_section.structuredContent?.section_id;
  await client.callTool({ name: 'add_section', arguments: baseArgs('B') });
  tracked.update_section = await client.callTool({
    name: 'update_section',
    arguments: { deck_id: contractDeckId, section_id: sec1Id, section_ir: PROSE_IR('A2') },
  });
  tracked.apply_section_node_edit = await client.callTool({
    name: 'apply_section_node_edit',
    arguments: {
      deck_id: contractDeckId,
      section_id: sec1Id,
      path: ['body', 0],
      new_node: { type: 'prose', body: [{ text: 'A3' }] },
    },
  });
  const list = await client.callTool({ name: 'list_sections', arguments: { deck_id: contractDeckId } });
  const orderIds = (payload(list)?.sections ?? []).map((s) => s.id).reverse();
  tracked.reorder_sections = await client.callTool({
    name: 'reorder_sections',
    arguments: { deck_id: contractDeckId, new_order: orderIds },
  });
  tracked.remove_section = await client.callTool({
    name: 'remove_section',
    arguments: { deck_id: contractDeckId, section_id: sec1Id },
  });
  for (const name of SECTION_MUTATING_TOOL_NAMES) {
    const r = tracked[name];
    const ok = !r?.isError && satisfiesContract(r?.structuredContent);
    check(
      `${name} populates structuredContent with section_id or section_count`,
      ok,
      `keys=${r?.structuredContent ? Object.keys(r.structuredContent).join(',') : 'undefined'}`,
    );
  }

  // 10b. v4.7: validate_deck_for_export pre-flight (slides deck).
  const preflight = await client.callTool({
    name: 'validate_deck_for_export',
    arguments: { deck_id: slidesDeckId },
  });
  const preflightP = payload(preflight);
  check(
    'validate_deck_for_export returns per-slide items + ready_for_export',
    Array.isArray(preflightP?.items)
      && preflightP.items.length >= 1
      && typeof preflightP.ready_for_export === 'boolean'
      && preflightP.authoring_model === 'slides',
    `items=${preflightP?.items?.length} ready=${preflightP?.ready_for_export} blocking=${preflightP?.blocking_count}`,
  );
  check(
    'validate_deck_for_export items carry per-issue detail (not just error_count)',
    preflightP?.items?.every((it) => Array.isArray(it.validation?.issues)),
  );

  // 10c. v4.7: image alt text + callout RichText title both compile cleanly.
  const v47Slide = await client.callTool({
    name: 'add_slide',
    arguments: {
      deck_id: slidesDeckId,
      slide_ir: {
        background: 'canvas',
        layout: 'default',
        body: [
          {
            type: 'callout',
            kind: 'tip',
            // RichText title — would have failed silently in v4.6 (string-only)
            title: [{ text: 'Pro tip' }, { text: ' (italic)', italic: true }],
            body: [{ text: 'Body' }],
          },
        ],
      },
      metadata: { title: 'v4.7', type: 'content', narrative: 'v47 features' },
    },
  });
  check(
    'add_slide accepts RichText callout title',
    !v47Slide.isError && payload(v47Slide)?.slide_id != null,
  );

  // 10d. v4.7: validation_depth=full opt-in surfaces Stage 2 issues at add time.
  const fullValidate = await client.callTool({
    name: 'add_slide',
    arguments: {
      deck_id: slidesDeckId,
      slide_ir: { background: 'canvas', layout: 'centered', body: [{ type: 'hero', title: [{ text: 'Stage2' }] }] },
      metadata: { title: 'S2', type: 'content', narrative: 's2' },
      validation_depth: 'full',
    },
  });
  const fullP = payload(fullValidate);
  check(
    'add_slide validation_depth=full ran Stage 2 (stage2Skipped=false)',
    !fullValidate.isError && fullP?.validation?.stage2Skipped === false,
    `stage2ElapsedMs=${fullP?.validation?.stage2ElapsedMs}`,
  );

  // 10e. v4.7 (this commit): the expanded node catalog renders end-to-end.
  const v47Catalog = await client.callTool({
    name: 'add_slide',
    arguments: {
      deck_id: slidesDeckId,
      slide_ir: {
        background: 'canvas',
        layout: 'default',
        body: [
          { type: 'heading', level: 2, text: [{ text: 'New nodes' }] },
          { type: 'list', style: 'bullet', items: [[{ text: 'one' }], [{ text: 'two' }]] },
          { type: 'divider', spacing: 'lg' },
          { type: 'quote', body: [{ text: 'Be lean.' }], attribution: [{ text: 'Pengui' }] },
          { type: 'table', headers: [[{ text: 'A' }], [{ text: 'B' }]], rows: [[[{ text: '1' }], [{ text: '2' }]]] },
        ],
      },
      metadata: { title: 'Catalog', type: 'content', narrative: 'v47 nodes' },
    },
  });
  const v47CatalogP = payload(v47Catalog);
  check(
    'v4.7 catalog (heading, list, divider, quote, table) compiles cleanly',
    !v47Catalog.isError
      && v47CatalogP?.slide_id != null
      && v47CatalogP?.validation?.passed === true,
    `errors=${v47CatalogP?.validation?.errorCount}`,
  );
  // Inspect the compiled HTML for the new tag classes.
  const v47Got = await client.callTool({
    name: 'get_slide',
    arguments: { deck_id: slidesDeckId, slide_id: v47CatalogP.slide_id },
  });
  const v47Html = payload(v47Got)?.html ?? '';
  check(
    'v4.7 nodes emit pengui-* classes for each new type',
    v47Html.includes('pengui-heading-2')
      && v47Html.includes('pengui-list-bullet')
      && v47Html.includes('pengui-divider')
      && v47Html.includes('pengui-quote')
      && v47Html.includes('pengui-table'),
  );

  // 10ef. v4.7: inline text color in RichText runs.
  const colorSlide = await client.callTool({
    name: 'add_slide',
    arguments: {
      deck_id: slidesDeckId,
      slide_ir: {
        background: 'canvas',
        layout: 'default',
        body: [
          { type: 'hero', title: [
            { text: 'Revenue grew ' },
            { text: '$2.5M', bold: true, color: 'accent' },
            { text: ' last quarter' },
          ] },
          { type: 'prose', body: [
            { text: 'Status: ' },
            { text: 'on track', color: 'success' },
            { text: ' for Q4 targets.' },
          ] },
        ],
      },
      metadata: { title: 'Color', type: 'content', narrative: 'inline color' },
    },
  });
  const colorSlideP = payload(colorSlide);
  check(
    'add_slide accepts inline text color (accent + success)',
    !colorSlide.isError && colorSlideP?.slide_id != null,
  );
  const colorGet = await client.callTool({
    name: 'get_slide',
    arguments: { deck_id: slidesDeckId, slide_id: colorSlideP.slide_id },
  });
  const colorHtml = payload(colorGet)?.html ?? '';
  check(
    'inline color emits pengui-text-accent + pengui-text-success spans',
    colorHtml.includes('<span class="pengui-text-accent">')
      && colorHtml.includes('<span class="pengui-text-success">'),
  );

  // 10f. v4.7: resource-access tools (list_resources, get_resource).
  const listResources = await client.callTool({ name: 'list_resources', arguments: {} });
  const listResourcesP = payload(listResources);
  check(
    'list_resources returns the registered pengui:// resources',
    Array.isArray(listResourcesP?.resources)
      && listResourcesP.resources.some((r) => r.uri === 'pengui://schema/slide-ir'),
    `count=${listResourcesP?.resources?.length}`,
  );
  const getResource = await client.callTool({
    name: 'get_resource',
    arguments: { uri: 'pengui://schema/slide-ir' },
  });
  const getResourceP = payload(getResource);
  check(
    'get_resource fetches the slide-ir schema content',
    typeof getResourceP?.text === 'string' && getResourceP.text.includes('node_types'),
    `mimeType=${getResourceP?.mimeType}`,
  );
  const missingResource = await client.callTool({
    name: 'get_resource',
    arguments: { uri: 'pengui://does/not/exist' },
  });
  check(
    'get_resource returns RESOURCE_NOT_FOUND for unknown URIs',
    missingResource.isError && payload(missingResource)?.code === 'RESOURCE_NOT_FOUND',
  );

  // 11. get_session returns build_info
  const sessionRes = await client.callTool({ name: 'get_session', arguments: {} });
  const buildInfo = payload(sessionRes)?.build_info;
  check(
    'get_session returns build_info',
    !!buildInfo && typeof buildInfo.build_sha === 'string',
    buildInfo ? `${buildInfo.build_sha} @ ${buildInfo.build_time}` : 'missing',
  );

  await client.close();

  console.log('\n=== summary ===');
  if (FAILS.length === 0) {
    console.log('All checks passed.');
    process.exit(0);
  } else {
    console.log(`Failures (${FAILS.length}):`);
    FAILS.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('driver crashed:', err);
  process.exit(2);
});
