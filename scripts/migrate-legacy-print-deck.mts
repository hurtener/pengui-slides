#!/usr/bin/env npx tsx
/**
 * One-shot migration: legacy slide-per-page print deck → v3 document sections.
 *
 * Why: SPEC-v3.md replaces the v2 per-slide print pipeline with a
 * continuous-document model. Legacy decks still load but cannot be
 * edited through the new `add_section` / `update_section` tools until
 * they carry `authoringModel: 'document'` and have Section entities in
 * place. This script converts a single deck in-place.
 *
 * Usage:
 *   npx tsx scripts/migrate-legacy-print-deck.mts <deck-id> [--dry-run]
 *
 * Behavior:
 *   1. Loads the deck from `PENGUI_PERSIST_DIR` (required).
 *   2. Rejects the migration if the deck is already a document-model
 *      deck, or if the deck is a slides_16_9 deck (slide mode is
 *      untouched by v3).
 *   3. For each legacy Slide, parses the HTML and emits ONE Section per
 *      meaningful block found inside the `.slide` root: a top-level
 *      `<figure>`, `<svg>`, or `<table>` becomes its own figure/chart/
 *      diagram/table section; remaining prose is gathered into a single
 *      `prose` section per slide. The original slide's `metadata.title`
 *      seeds the section metadata.
 *   4. Sets `authoringModel = 'document'`, clears `slideIds`, and writes
 *      sections in order.
 *
 * With `--dry-run`: prints the plan (kind + title per new section) and
 * exits without touching the store.
 *
 * Limitations:
 *   - Heuristic block detection: nested figures inside prose may not
 *     split cleanly. Review the output and `update_section` as needed.
 *   - Soul CSS tokens that were pasted into each legacy slide's :root
 *     are dropped — the composer injects them once at document scope.
 *   - Page-chrome directives at the deck level are preserved (moved to
 *     `documentMeta.chrome`); per-slide chrome overrides become the
 *     section's `metadata.chromeOverrides`.
 */

import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { createContainer } from '../src/container.js';
import { loadConfig } from '../src/config.js';
import type { Deck, Slide } from '../src/types/deck.js';
import type { Section, SectionKind } from '../src/types/section.js';
import type { PageChromeDirective } from '../src/types/page-chrome.js';

// ── CLI ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const deckIdArg = args.find((a) => !a.startsWith('--'));

if (!deckIdArg) {
  console.error('usage: migrate-legacy-print-deck.mts <deck-id> [--dry-run]');
  process.exit(1);
}

const persistDir = process.env.PENGUI_PERSIST_DIR;
if (!persistDir) {
  console.error('PENGUI_PERSIST_DIR must be set so the migration can load the deck.');
  process.exit(1);
}

// ── Container ────────────────────────────────────────────────────

const container = createContainer(loadConfig({ logLevel: 'error', persistDir }));

// ── Block classification ─────────────────────────────────────────

interface BlockPlan {
  kind: SectionKind;
  title: string;
  html: string;
  narrative: string;
}

function extractPageChromeDirective(html: string): PageChromeDirective | null {
  const match = html.match(/<!--\s*@page-chrome\s+([\s\S]*?)-->/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim()) as PageChromeDirective;
  } catch {
    return null;
  }
}

/**
 * Split a legacy slide's HTML into one or more Section plans. Top-level
 * `<figure>`, `<svg>`, and `<table>` elements become their own sections;
 * everything else is gathered into a prose section.
 */
function planSectionsForSlide(slide: Slide, slideIndex: number): BlockPlan[] {
  const $ = cheerio.load(slide.html);
  const root = $('.slide').first();
  if (root.length === 0) {
    // Couldn't find a `.slide` wrapper — treat the entire body as prose.
    return [
      {
        kind: 'prose',
        title: slide.metadata.title || `Page ${slideIndex + 1}`,
        html: $('body').html() ?? slide.html,
        narrative: slide.metadata.narrative,
      },
    ];
  }

  const plans: BlockPlan[] = [];
  const proseParts: string[] = [];

  const children = root.children();
  children.each((_i, el) => {
    const $el = $(el);
    const tag = (el as { tagName?: string }).tagName?.toLowerCase();

    if (tag === 'figure' || $el.hasClass('pengui-figure')) {
      const caption = $el.find('figcaption').text().trim();
      plans.push({
        kind: $el.find('svg').length > 0 ? 'figure' : 'figure',
        title: caption || `Figure from page ${slideIndex + 1}`,
        html: wrapFragment('figure', $.html($el), caption || slide.metadata.title),
        narrative: slide.metadata.narrative,
      });
      return;
    }

    if (tag === 'svg') {
      plans.push({
        kind: 'diagram',
        title: `Diagram from page ${slideIndex + 1}`,
        html: wrapFragment('diagram', `<figure class="pengui-diagram">${$.html($el)}</figure>`, slide.metadata.title),
        narrative: slide.metadata.narrative,
      });
      return;
    }

    if (tag === 'table') {
      plans.push({
        kind: 'table',
        title: `Table from page ${slideIndex + 1}`,
        html: wrapFragment('table', $.html($el), slide.metadata.title),
        narrative: slide.metadata.narrative,
      });
      return;
    }

    // Accumulate anything else as prose markup.
    proseParts.push($.html($el));
  });

  if (proseParts.length > 0) {
    plans.unshift({
      kind: inferProseKind(slideIndex, slide.metadata.type),
      title: slide.metadata.title || `Page ${slideIndex + 1}`,
      html: wrapFragment(inferProseKind(slideIndex, slide.metadata.type), proseParts.join('\n'), slide.metadata.title || ''),
      narrative: slide.metadata.narrative,
    });
  }

  if (plans.length === 0) {
    // Fallback: one prose section with whatever was inside .slide.
    const inner = root.html() ?? '';
    plans.push({
      kind: 'prose',
      title: slide.metadata.title || `Page ${slideIndex + 1}`,
      html: wrapFragment('prose', inner, slide.metadata.title || ''),
      narrative: slide.metadata.narrative,
    });
  }

  return plans;
}

function inferProseKind(slideIndex: number, slideType: string): SectionKind {
  if (slideIndex === 0) return 'cover';
  if (slideType === 'cover' || slideType === 'title') return 'cover';
  if (slideType === 'toc' || slideType === 'table_of_contents') return 'toc';
  if (slideType === 'chapter' || slideType === 'chapter_intro') return 'chapter_header';
  if (slideType === 'compare' || slideType === 'comparison') return 'comparison';
  if (slideType === 'glossary') return 'glossary';
  if (slideType === 'bibliography' || slideType === 'references') return 'bibliography';
  return 'prose';
}

function wrapFragment(kind: SectionKind, innerHtml: string, title: string): string {
  const meta = JSON.stringify({
    title,
    kind,
    narrative: '',
    tags: ['migrated'],
  });
  return `<!-- @section-meta ${meta} -->\n<section class="pengui-section pengui-${kind}">\n${innerHtml}\n</section>`;
}

// ── Execute ──────────────────────────────────────────────────────

async function main() {
  const deck = (await container.deckStore.get(deckIdArg as unknown as Deck['id'])) as Deck | undefined;
  if (!deck) {
    console.error(`deck not found: ${deckIdArg}`);
    process.exit(1);
  }

  const model = deck.authoringModel ?? 'slides';
  if (model === 'document') {
    console.error(`deck ${deckIdArg} is already in document mode. Nothing to migrate.`);
    process.exit(0);
  }

  if (deck.format !== 'print_a4_portrait' && deck.format !== 'print_letter_portrait') {
    console.error(`deck ${deckIdArg} format is ${deck.format ?? 'slides_16_9'}; migration only applies to print formats.`);
    process.exit(1);
  }

  console.error(`\nMigrating deck "${deck.title}" (${deck.id}) from slides → document`);
  console.error(`format: ${deck.format}`);
  console.error(`slides: ${deck.slideIds.length}`);
  console.error('');

  const slides = await container.slideStore.getByDeck(deck.id);
  slides.sort((a, b) => a.position - b.position);

  // Collect deck-level page chrome from the FIRST slide that declares it
  // (v2 convention). Promote it to `documentMeta.chrome`.
  let chrome: PageChromeDirective | null = null;
  for (const slide of slides) {
    const directive = extractPageChromeDirective(slide.html);
    if (directive) {
      chrome = directive;
      break;
    }
  }

  // Plan sections.
  const plans: BlockPlan[] = [];
  slides.forEach((slide, idx) => {
    for (const plan of planSectionsForSlide(slide, idx)) {
      plans.push(plan);
    }
  });

  console.error('Planned sections:');
  plans.forEach((p, i) => {
    console.error(`  ${i + 1}. [${p.kind}] ${p.title}`);
  });
  console.error(`\nTotal new sections: ${plans.length}`);

  if (chrome) {
    console.error(`\nPromoting deck-level chrome: ${JSON.stringify(chrome)}`);
  }

  if (dryRun) {
    console.error('\n--dry-run — no changes written.');
    return;
  }

  // Apply.
  // Note: DocumentService.addSection guards against slides-mode decks.
  // Flip authoringModel first, then add sections.
  deck.authoringModel = 'document';
  deck.sectionIds = [];
  deck.documentMeta = {
    ...(deck.documentMeta ?? {}),
    ...(chrome ? { chrome } : {}),
  };
  deck.updatedAt = new Date().toISOString();
  await container.deckStore.save(deck);

  for (const plan of plans) {
    await container.documentService.addSection({
      deckId: deck.id as string,
      kind: plan.kind,
      html: plan.html,
      metadata: {
        title: plan.title,
        narrative: plan.narrative || `Migrated from legacy print deck ${deck.id}.`,
        tags: ['migrated'],
      },
    });
  }

  // Delete the legacy slides (they'd otherwise sit around in the store).
  const backupPath = path.join(persistDir!, 'slides', `_backup-${deck.id}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(slides, null, 2), 'utf-8');
  console.error(`\nBacked up legacy slides to: ${backupPath}`);

  // Clear slideIds on the deck after addSections, since addSection already updated sectionIds.
  const fresh = await container.deckStore.get(deck.id);
  if (fresh) {
    fresh.slideIds = [];
    await container.deckStore.save(fresh);
  }

  for (const slide of slides) {
    await container.slideStore.delete(slide.id);
  }

  console.error(`\nMigration complete. Deck now has ${plans.length} sections.`);
  console.error('Review with: get_deck_summary then list_sections in your MCP client.');
}

main().catch((err) => {
  console.error('migration failed:', err);
  process.exit(1);
});
