/**
 * v4.6: token override propagates to existing IR slides + sections.
 *
 * The apply_token_override flow updates the soul, then walks every IR-
 * authored slide (slide-mode decks) and every section (document-mode
 * decks) linked to that soul and recompiles their stored HTML against
 * the new token values. Pre-v4.5 legacy_html slides are skipped.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createContainer } from '../../../src/container.js';
import { loadConfig } from '../../../src/config.js';
import { sampleSoulInput, makeSlideIR, makeSectionIR } from '../../helpers/fixtures.js';

describe('token override propagation (v4.6)', () => {
  let container: ReturnType<typeof createContainer>;
  let soulIdStr: string;
  let slideDeckId: string;
  let docDeckId: string;
  let slideId: string;
  let sectionId: string;

  beforeEach(async () => {
    container = createContainer(loadConfig({ logLevel: 'error' }));
    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    soulIdStr = soul.id as string;

    const slideDeck = await container.deckService.createDeck({ soulId: soulIdStr, title: 'Slide Deck' });
    slideDeckId = slideDeck.id as string;
    const slide = await container.deckService.addSlide({
      deckId: slideDeckId,
      ir: makeSlideIR('Hello'),
      metadata: { title: 'Hello', type: 'content', narrative: 'n' },
    });
    slideId = slide.id as string;

    const docDeck = await container.deckService.createDeck({
      soulId: soulIdStr,
      title: 'Doc Deck',
      format: 'print_a4_portrait',
    });
    docDeckId = docDeck.id as string;
    const { section } = await container.documentService.addSection({
      deckId: docDeckId,
      kind: 'prose',
      ir: makeSectionIR('Body'),
      metadata: { title: 'Body', narrative: 'n' },
    });
    sectionId = section.id as string;
  });

  it('recompiles every IR slide so the new soul token shows in slide.html', async () => {
    const before = await container.deckService.getSlide(slideId);
    expect(before.html).toContain('--color-accent-primary: #228be6');

    await container.soulService.applyTokenOverride(
      soulIdStr as never,
      'color',
      'accentPrimary',
      '#aa5500',
    );
    const recompile = await container.deckService.recompileSlidesForSoul(soulIdStr as never);
    expect(recompile.recompiledCount).toBe(1);
    expect(recompile.failures).toHaveLength(0);

    const after = await container.deckService.getSlide(slideId);
    expect(after.html).toContain('--color-accent-primary: #aa5500');
    expect(after.html).not.toContain('--color-accent-primary: #228be6');
    expect(after.sourceKind).toBe('authored_ir');
    expect(after.metadata.revisionHash).not.toBe(before.metadata.revisionHash);
  });

  it('section HTML stays soul-token-agnostic (composer resolves at render time)', async () => {
    // Sections never embed soul tokens — they emit `var(--*)` references
    // that the document composer resolves at render time. So a token
    // override leaves section.html unchanged. Confirms we don't accidentally
    // wire section recompiles into apply_token_override.
    const before = await container.documentService.getSection(sectionId);
    expect(before.html).not.toContain('#228be6');
    expect(before.html).toContain('var(--');

    await container.soulService.applyTokenOverride(soulIdStr as never, 'color', 'accentPrimary', '#aa5500');

    const after = await container.documentService.getSection(sectionId);
    expect(after.html).toBe(before.html);
    expect(after.metadata.revisionHash).toBe(before.metadata.revisionHash);
  });

  it('skips slides on decks linked to other souls', async () => {
    // Register a second soul + deck. Touching soul A must not recompile B.
    const otherSoul = await container.soulService.register({
      ...sampleSoulInput,
      name: 'Other Soul',
    });
    await container.soulService.approve(otherSoul.id);
    const otherDeck = await container.deckService.createDeck({
      soulId: otherSoul.id as string,
      title: 'Other Deck',
    });
    const otherSlide = await container.deckService.addSlide({
      deckId: otherDeck.id as string,
      ir: makeSlideIR('Other'),
      metadata: { title: 'Other', type: 'content', narrative: 'n' },
    });
    const otherBefore = await container.deckService.getSlide(otherSlide.id as string);
    const otherHashBefore = otherBefore.metadata.revisionHash;

    await container.soulService.applyTokenOverride(soulIdStr as never, 'color', 'accentPrimary', '#aa5500');
    const recompile = await container.deckService.recompileSlidesForSoul(soulIdStr as never);
    // Only the original deck's slide should be touched.
    expect(recompile.recompiledCount).toBe(1);

    const otherAfter = await container.deckService.getSlide(otherSlide.id as string);
    expect(otherAfter.metadata.revisionHash).toBe(otherHashBefore);
  });
});
