#!/usr/bin/env node
/**
 * End-to-end driver for the document-mode section flow.
 *
 * Connects to a running Pengui Slides MCP server on http://127.0.0.1:3030/mcp
 * and exercises the full agent-facing flow for sections, including the new
 * surgical repair tools (promote_section_root, wrap_section_root) and the
 * inline validation that landed in v4.1.
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

// SDK exposes both content[0].text and structuredContent; prefer the latter.
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

  // 2. Create deck
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
    `authoring_model=${deckPayload?.authoring_model}`,
  );

  // 3. open_deck_editor on EMPTY document deck — must succeed (was the original v4 bug)
  const open = await client.callTool({
    name: 'open_deck_editor',
    arguments: { deck_id: deckId },
  });
  const openPayload = payload(open);
  check(
    'open_deck_editor succeeds on empty document deck (no false DECK_NOT_FOUND)',
    !open.isError && openPayload?.deck_id === deckId,
    `isError=${open.isError} code=${openPayload?.code}`,
  );
  check(
    'open_deck_editor returns authoring_model: document',
    openPayload?.authoring_model === 'document',
    `authoring_model=${openPayload?.authoring_model}`,
  );
  check(
    'open_deck_editor omits editor_state for document decks',
    openPayload && !('editor_state' in openPayload),
    `keys=${openPayload ? Object.keys(openPayload).join(',') : 'null'}`,
  );

  // 4. add_section with multi-root HTML — should be accepted, validation flags wrap
  const multiRoot = await client.callTool({
    name: 'add_section',
    arguments: {
      deck_id: deckId,
      kind: 'cover',
      html: '<div class="cover-stripe"></div><div class="cover-body"><h1>Hi</h1></div><div class="cover-footer">f</div>',
      metadata: { title: 'Cover', narrative: 'Cover page' },
    },
  });
  if (multiRoot.isError) {
    console.error('add_section (multi-root) errored:', JSON.stringify(payload(multiRoot), null, 2));
  }
  const multiP = payload(multiRoot);
  const multiSid = multiP?.section_id;
  check('add_section accepts multi-root HTML (does not reject)', !!multiSid, `section_id=${multiSid}`);
  const multiIssues = multiP?.validation?.issues ?? [];
  const wrapHint = multiIssues.find(
    (i) => i.id?.includes('multiple-root-elements') && i.fixSuggestion?.includes('wrap_section_root'),
  );
  check(
    'multi-root error names wrap_section_root in fixSuggestion',
    !!wrapHint,
    wrapHint ? `id=${wrapHint.id}` : `issue ids=${multiIssues.map((i) => i.id).join(', ')}`,
  );
  check(
    'multi-root error enumerates top-level elements in `actual`',
    !!wrapHint?.actual?.includes('cover-stripe'),
    `actual=${(wrapHint?.actual ?? '').slice(0, 120)}`,
  );

  // 5. wrap_section_root — should clean
  const wrapped = await client.callTool({
    name: 'wrap_section_root',
    arguments: { deck_id: deckId, section_id: multiSid },
  });
  if (wrapped.isError) {
    console.error('wrap_section_root errored:', JSON.stringify(payload(wrapped), null, 2));
  }
  const wrappedP = payload(wrapped);
  check(
    'wrap_section_root reports correct wrapped_element_count',
    wrappedP?.wrapped_element_count === 3,
    `wrapped=${wrappedP?.wrapped_element_count}`,
  );
  check(
    'wrap_section_root re-validates the structural error away',
    !wrappedP?.validation?.issues?.some?.(
      (i) => i.id?.includes('multiple-root-elements') || i.id?.includes('root-not-section'),
    ),
    `remaining structural issues=${wrappedP?.validation?.issues?.filter?.(
      (i) => i.id?.includes('root') || i.id?.includes('multiple'),
    ).length ?? 'unknown'}`,
  );

  // 6. add_section with single <div> root → should name promote_section_root
  const single = await client.callTool({
    name: 'add_section',
    arguments: {
      deck_id: deckId,
      kind: 'prose',
      html: '<div class="lede" style="background: red"><p>Body text</p></div>',
      metadata: { title: 'Lede', narrative: 'Single-root prose' },
    },
  });
  if (single.isError) {
    console.error('add_section (single div) errored:', JSON.stringify(payload(single), null, 2));
  }
  const singleP = payload(single);
  const singleSid = singleP?.section_id;
  const singleIssues = singleP?.validation?.issues ?? [];
  const promoteHint = singleIssues.find(
    (i) => i.id?.includes('root-not-section') && i.fixSuggestion?.includes('promote_section_root'),
  );
  check(
    'single-root <div> error names promote_section_root in fixSuggestion',
    !!promoteHint,
    promoteHint ? `id=${promoteHint.id}` : `issue ids=${singleIssues.map((i) => i.id).join(', ')}`,
  );

  // 7. promote_section_root — should clean
  const promoted = await client.callTool({
    name: 'promote_section_root',
    arguments: { deck_id: deckId, section_id: singleSid },
  });
  if (promoted.isError) {
    console.error('promote_section_root errored:', JSON.stringify(payload(promoted), null, 2));
  }
  const promotedP = payload(promoted);
  check(
    'promote_section_root re-validates structural error away',
    !promotedP?.validation?.issues?.some?.((i) => i.id?.includes('root-not-section')),
  );

  const got = await client.callTool({
    name: 'get_section',
    arguments: { section_id: singleSid },
  });
  const storedHtml = payload(got)?.section?.html ?? '';
  check(
    'promoted section now has <section class="pengui-section pengui-prose ...">',
    /<section[^>]*class="pengui-section pengui-prose/.test(storedHtml),
    `head=${storedHtml.slice(0, 160)}…`,
  );
  check(
    'promoted section preserves original style attribute',
    /background:\s*red/.test(storedHtml),
  );
  check(
    'promoted section has @section-meta comment auto-embedded',
    /<!--\s*@section-meta\s+\{/.test(storedHtml),
  );

  // 8. Reorder by inserting at head — confirm @section-meta position re-embeds
  const inserted = await client.callTool({
    name: 'add_section',
    arguments: {
      deck_id: deckId,
      kind: 'prose',
      html: '<section class="pengui-section pengui-prose"><p>inserted</p></section>',
      metadata: { title: 'Inserted', narrative: 'pushed to head' },
      position: 0,
    },
  });
  if (inserted.isError) {
    console.error('add_section position=0 errored:', JSON.stringify(payload(inserted), null, 2));
  }
  check('add_section accepted at position 0', !!payload(inserted)?.section_id);

  const shifted = await client.callTool({
    name: 'get_section',
    arguments: { section_id: singleSid },
  });
  const shiftedSection = payload(shifted)?.section;
  const shiftedHtml = shiftedSection?.html ?? '';
  check(
    'shifted section position field updated to 2',
    shiftedSection?.position === 2,
    `position=${shiftedSection?.position}`,
  );
  check(
    'shifted section @section-meta JSON shows position=2 (no stale 1)',
    /"position":\s*2\b/.test(shiftedHtml) && !/"position":\s*1\b/.test(shiftedHtml),
    `meta-has-2=${/"position":\s*2/.test(shiftedHtml)} meta-has-1=${/"position":\s*1/.test(shiftedHtml)}`,
  );

  // 9. list_sections
  const list = await client.callTool({
    name: 'list_sections',
    arguments: { deck_id: deckId },
  });
  check(
    'list_sections returns the 3 sections we added',
    payload(list)?.section_count === 3,
    `section_count=${payload(list)?.section_count}`,
  );

  // 10. WRONG_AUTHORING_MODEL: add_slide on a document deck
  const wrongModel = await client.callTool({
    name: 'add_slide',
    arguments: {
      deck_id: deckId,
      html: '<!DOCTYPE html><html><body><div class="slide">x</div></body></html>',
      metadata: { title: 't', type: 'content', narrative: 'n' },
    },
  });
  const wmP = payload(wrongModel);
  check(
    'add_slide on document deck → WRONG_AUTHORING_MODEL (typed)',
    wrongModel.isError && wmP?.code === 'WRONG_AUTHORING_MODEL',
    `code=${wmP?.code}`,
  );

  // 11. Typed INVALID_INPUT from wrap_section_root with bad child_order
  // Section is now a single conforming root after step 5, so any child_order is wrong.
  const badOrder = await client.callTool({
    name: 'wrap_section_root',
    arguments: { deck_id: deckId, section_id: multiSid, child_order: [99, 99] },
  });
  const boP = payload(badOrder);
  check(
    'wrap_section_root with bad child_order → INVALID_INPUT (not INTERNAL_ERROR)',
    badOrder.isError && boP?.code === 'INVALID_INPUT',
    `code=${boP?.code} msg=${boP?.message?.slice?.(0, 80) ?? ''}`,
  );

  // ── v4.2 additions ──────────────────────────────────────────────────────

  // 12. Auto-substitution: the soul declares accentPrimary: #228be6, so an
  //     incoming `background: #228be6` should be silently rewritten to
  //     `var(--color-accent-primary)`. Validation now PASSES (no
  //     token-compliance issue) and the response carries auto_substitutions
  //     as feedback so the agent learns the mapping.
  const tokenLiteral = await client.callTool({
    name: 'add_section',
    arguments: {
      deck_id: deckId,
      kind: 'prose',
      html: '<section class="pengui-section pengui-prose" style="background: #228be6"><p>x</p></section>',
      metadata: { title: 'TokenLiteral', narrative: 'literal hex collides with soul' },
    },
  });
  const tokenLiteralP = payload(tokenLiteral);
  const tokenSid = tokenLiteralP?.section_id;
  check(
    'add_section returns auto_substitutions for soul-known hex',
    Array.isArray(tokenLiteralP?.auto_substitutions)
      && tokenLiteralP.auto_substitutions.some(
        (s) => s.literal === '#228be6' && s.token === '--color-accent-primary',
      ),
    `auto_substitutions=${JSON.stringify(tokenLiteralP?.auto_substitutions)}`,
  );
  const tokenIssues = tokenLiteralP?.validation?.issues ?? [];
  const stillFlagged = tokenIssues.find((i) => i.rule === 'token-compliance' && i.actual === '#228be6');
  check(
    'token-compliance no longer flags the substituted literal (validation clean)',
    !stillFlagged,
    stillFlagged ? `unexpected issue: ${stillFlagged.message}` : 'no residual token-compliance issue',
  );
  // Verify storage actually has the var() form, not the original hex.
  const tokenStored = await client.callTool({
    name: 'get_section',
    arguments: { section_id: tokenSid },
  });
  const tokenHtml = payload(tokenStored)?.section?.html ?? '';
  check(
    'stored HTML contains var(--color-accent-primary), not #228be6',
    tokenHtml.includes('var(--color-accent-primary)') && !tokenHtml.includes('#228be6'),
    `head=${tokenHtml.slice(0, 200)}…`,
  );

  // 12b. A literal that the soul does NOT declare passes through untouched
  //      and the validator still emits the helpful fallback fix-suggestion.
  const unknownHex = await client.callTool({
    name: 'add_section',
    arguments: {
      deck_id: deckId,
      kind: 'prose',
      html: '<section class="pengui-section pengui-prose" style="background: #c0ffee"><p>x</p></section>',
      metadata: { title: 'UnknownHex', narrative: 'not in soul' },
    },
  });
  const unknownP = payload(unknownHex);
  check(
    'unknown hex is NOT auto-substituted (passes through untouched)',
    (unknownP?.auto_substitutions ?? []).length === 0,
    `auto_substitutions count=${(unknownP?.auto_substitutions ?? []).length}`,
  );
  const unknownIssues = unknownP?.validation?.issues ?? [];
  const unknownLiteralIssue = unknownIssues.find(
    (i) => i.rule === 'token-compliance' && i.actual === '#c0ffee',
  );
  check(
    'unknown hex is flagged by token-compliance with the generic guidance',
    unknownLiteralIssue?.fixSuggestion?.includes('get_design_soul'),
    `suggestion=${unknownLiteralIssue?.fixSuggestion?.slice(0, 140)}`,
  );

  // 13. DECK_EMPTY: opening an empty SLIDES deck via open_deck_editor must
  //     return DECK_EMPTY (not the misleading DECK_NOT_FOUND that bit
  //     us in the v4 → v4.1 cycle).
  const slidesDeck = await client.callTool({
    name: 'create_deck',
    arguments: { soul_id: soulId, format: 'slides_16_9', title: 'Empty Slides' },
  });
  const slidesDeckId = payload(slidesDeck)?.deck_id ?? payload(slidesDeck)?.id;
  const openEmpty = await client.callTool({
    name: 'open_deck_editor',
    arguments: { deck_id: slidesDeckId },
  });
  const openEmptyP = payload(openEmpty);
  check(
    'open_deck_editor on empty slides deck returns DECK_EMPTY (typed)',
    openEmpty.isError && openEmptyP?.code === 'DECK_EMPTY',
    `code=${openEmptyP?.code}`,
  );
  check(
    'DECK_EMPTY error names suggestedTool: "add_slide"',
    openEmptyP?.details?.suggestedTool === 'add_slide',
    `suggestedTool=${openEmptyP?.details?.suggestedTool}`,
  );

  // 14. Comment-safe metadata encoding: a title containing "-->" must
  //     round-trip through storage without splitting the @section-meta
  //     comment.
  const dashSection = await client.callTool({
    name: 'add_section',
    arguments: {
      deck_id: deckId,
      kind: 'prose',
      html: '<section class="pengui-section pengui-prose"><p>x</p></section>',
      metadata: { title: 'Step 1 --> Step 2', narrative: 'has a -- run' },
    },
  });
  const dashSid = payload(dashSection)?.section_id;
  const dashGot = await client.callTool({
    name: 'get_section',
    arguments: { section_id: dashSid },
  });
  const dashHtml = payload(dashGot)?.section?.html ?? '';
  const dashMeta = payload(dashGot)?.section?.metadata ?? {};
  // Comment must be parseable: extract the @section-meta JSON and decode.
  const metaMatch = dashHtml.match(/<!--\s*@section-meta\s+([\s\S]*?)-->/);
  let decoded = null;
  if (metaMatch) {
    try { decoded = JSON.parse(metaMatch[1].trim()); } catch { /* fail below */ }
  }
  check(
    'metadata containing "-->" round-trips through storage',
    decoded?.title === 'Step 1 --> Step 2' && decoded?.narrative === 'has a -- run',
    `decoded.title=${decoded?.title}`,
  );
  check(
    'storage struct preserves the literal "-->" in metadata',
    dashMeta.title === 'Step 1 --> Step 2',
    `metadata.title=${dashMeta.title}`,
  );

  // 15. render_section_preview: produces a non-empty PNG for a document section.
  //     This actually exercises the Playwright pool + DocumentComposer path.
  const preview = await client.callTool({
    name: 'render_section_preview',
    arguments: { deck_id: deckId, section_id: singleSid, scale: 0.5 },
  });
  if (preview.isError) {
    console.error('render_section_preview errored:', JSON.stringify(payload(preview), null, 2));
  }
  const previewP = payload(preview);
  check(
    'render_section_preview returns a base64 PNG',
    typeof previewP?.image_base64 === 'string' && previewP.image_base64.length > 1000,
    `bytes=${previewP?.image_base64?.length ?? 0} format=${previewP?.format}`,
  );
  check(
    'render_section_preview reports image dimensions',
    typeof previewP?.width === 'number' && typeof previewP?.height === 'number'
      && previewP.width > 0 && previewP.height > 0,
    `${previewP?.width}x${previewP?.height}`,
  );
  check(
    'render_section_preview rejects on slides decks (FormatNotExportableError)',
    await (async () => {
      const wrong = await client.callTool({
        name: 'render_section_preview',
        arguments: { deck_id: slidesDeckId, section_id: singleSid },
      });
      return wrong.isError && payload(wrong)?.code === 'FORMAT_NOT_EXPORTABLE';
    })(),
  );

  // 16. Tool descriptions surface enough context for an agent without repo access
  const tools = await client.listTools();
  const promote = tools.tools.find((t) => t.name === 'promote_section_root');
  check(
    'promote_section_root description mentions trigger rule id',
    promote?.description?.includes('section-structural') &&
      promote?.description?.includes('-root-not-section'),
  );
  const wrap = tools.tools.find((t) => t.name === 'wrap_section_root');
  check(
    'wrap_section_root description names INVALID_INPUT failure mode',
    wrap?.description?.includes('INVALID_INPUT'),
  );
  const addSec = tools.tools.find((t) => t.name === 'add_section');
  check(
    'add_section top-level description explains @section-meta auto-injection',
    addSec?.description?.includes('@section-meta') &&
      addSec?.description?.toLowerCase().includes('inject'),
  );
  check(
    'add_section html-field description warns to NOT emit @section-meta',
    addSec?.inputSchema?.properties?.html?.description?.includes('Do NOT emit'),
  );
  const previewTool = tools.tools.find((t) => t.name === 'render_section_preview');
  check(
    'render_section_preview is registered and described as document-only',
    !!previewTool && previewTool.description.includes('document-mode'),
  );
  check(
    'render_section_preview description names trigger conditions (after add/update/promote/wrap)',
    previewTool?.description?.includes('add_section') &&
      previewTool?.description?.includes('promote_section_root'),
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
