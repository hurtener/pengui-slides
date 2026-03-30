import { describe, expect, it } from 'vitest';
import { DocumentExportPlanner } from '../../../../src/domain/export/document-export-planner.js';
import type { Slide } from '../../../../src/types/deck.js';

function makeSlide(): Slide {
  return {
    id: 'slide-1' as never,
    deckId: 'deck-1' as never,
    position: 0,
    html: '<!DOCTYPE html><html><head></head><body><div class="slide"><span data-edit-id="badge-1">Badge</span></div></body></html>',
    sourceKind: 'document_v1',
    translationIssues: [],
    document: {
      version: '1',
      sourceRevisionHash: 'rev-1',
      width: 1920,
      height: 1080,
      backgroundColor: '#ffffff',
      elements: [
        {
          id: 'badge-1',
          kind: 'text',
          x: 100,
          y: 120,
          width: 200,
          height: 44,
          rotation: 0,
          zIndex: 0,
          opacity: 1,
          locked: false,
          exportDisposition: 'native',
          selector: 'span.badge',
          text: 'Badge',
          paragraphs: [{ text: 'Badge', runs: [{ text: 'Badge' }] }],
          editId: 'badge-1',
          style: {
            backgroundColor: '#eeeeee',
            borderColor: '#111111',
            borderWidth: 1,
            borderRadius: 12,
            paddingLeft: 18,
            paddingRight: 18,
            color: '#111111',
            fontSize: 18,
          },
        },
      ],
    },
    metadata: {
      title: 'Planner Slide',
      type: 'content',
      narrative: '',
      keyPoints: [],
      dataPoints: [],
      tags: [],
      generatedAt: new Date().toISOString(),
      soulId: 'soul-1',
      deckId: 'deck-1',
      position: 0,
      metaVersion: '1.0',
      revisionHash: 'rev-1',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('DocumentExportPlanner', () => {
  it('splits box-like text into a background shape and plain text overlay', () => {
    const planner = new DocumentExportPlanner();
    const slide = makeSlide();

    const plan = planner.plan(slide, slide.document!, { allowRuntimeBackgroundFallback: true });

    expect(plan.nativeObjectCount).toBe(2);
    expect(plan.nativeElements).toHaveLength(2);
    expect(plan.nativeElements[0].kind).toBe('shape');
    expect(plan.nativeElements[1].kind).toBe('text');
    expect(plan.nativeElements[1].id).toContain('_content');
  });

  it('classifies decorative deliverables card chrome into background fallback', () => {
    const planner = new DocumentExportPlanner();
    const slide = makeSlide();
    slide.document!.backgroundImage = 'linear-gradient(#111, #222)';
    slide.document!.elements = [
      {
        id: 'card-1',
        kind: 'shape',
        x: 80,
        y: 100,
        width: 600,
        height: 800,
        rotation: 0,
        zIndex: 0,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        selector: 'div.card',
        shapeType: 'roundRectangle',
        style: {
          backgroundColor: '#1a1a1a',
          borderColor: '#ff0000',
          borderWidth: 1,
          borderRadius: 22,
        },
      },
      {
        id: 'month',
        kind: 'text',
        x: 120,
        y: 140,
        width: 200,
        height: 30,
        rotation: 0,
        zIndex: 1,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        selector: 'span.month-label',
        text: 'APR 2026',
        paragraphs: [{ text: 'APR 2026', runs: [{ text: 'APR 2026' }] }],
        style: { color: '#ffffff', fontSize: 18 },
      },
      {
        id: 'title',
        kind: 'text',
        x: 120,
        y: 220,
        width: 400,
        height: 60,
        rotation: 0,
        zIndex: 2,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        selector: 'h3.card-title',
        text: 'Deliverable',
        paragraphs: [{ text: 'Deliverable', runs: [{ text: 'Deliverable' }] }],
        style: { color: '#ffffff', fontSize: 32 },
      },
    ];

    const plan = planner.plan(slide, slide.document!, { allowRuntimeBackgroundFallback: true });

    expect(plan.usedBackgroundFallback).toBe(true);
    expect(plan.document.elements[0].exportDisposition).toBe('background');
    expect(plan.backgroundHtml).toContain('background-image');
  });

  it('preserves backgrounded text in synthesized fallback HTML', () => {
    const planner = new DocumentExportPlanner();
    const slide = makeSlide();
    slide.document!.elements = [
      {
        id: 'decorative-ordinal',
        kind: 'text',
        x: 120,
        y: 160,
        width: 240,
        height: 72,
        rotation: 0,
        zIndex: 0,
        opacity: 0.35,
        locked: false,
        exportDisposition: 'background',
        selector: 'span.card-ordinal',
        text: '01',
        paragraphs: [{ text: '01', runs: [{ text: '01' }] }],
        style: {
          color: '#333333',
          fontSize: 72,
          fontWeight: 700,
        },
      },
      {
        id: 'native-shape',
        kind: 'shape',
        x: 80,
        y: 100,
        width: 600,
        height: 400,
        rotation: 0,
        zIndex: 1,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        selector: 'div.panel',
        shapeType: 'rectangle',
        style: {
          backgroundColor: '#ffffff',
        },
      },
    ];

    const plan = planner.plan(slide, slide.document!, { allowRuntimeBackgroundFallback: true });

    expect(plan.usedBackgroundFallback).toBe(true);
    expect(plan.backgroundHtml).toContain('>01</div>');
    expect(plan.backgroundHtml).toContain('font-size:72px');
    expect(plan.backgroundHtml).toContain('color:#333333');
  });

  it('preserves element-level background-image styles in synthesized fallback HTML', () => {
    const planner = new DocumentExportPlanner();
    const slide = makeSlide();
    slide.document!.elements = [
      {
        id: 'decorative-panel',
        kind: 'shape',
        x: 60,
        y: 80,
        width: 720,
        height: 360,
        rotation: 0,
        zIndex: 0,
        opacity: 1,
        locked: false,
        exportDisposition: 'background',
        selector: 'div.panel',
        shapeType: 'rectangle',
        style: {
          backgroundImage: 'linear-gradient(90deg, #111111, #333333)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        },
      },
      {
        id: 'native-copy',
        kind: 'text',
        x: 120,
        y: 120,
        width: 320,
        height: 60,
        rotation: 0,
        zIndex: 1,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
      selector: 'h2.title',
      text: 'Native text',
      paragraphs: [{ text: 'Native text', runs: [{ text: 'Native text' }] }],
      style: {
        color: '#ffffff',
        fontSize: 32,
      },
      },
    ];

    const plan = planner.plan(slide, slide.document!, { allowRuntimeBackgroundFallback: true });

    expect(plan.usedBackgroundFallback).toBe(true);
    expect(plan.backgroundHtml).toContain('background-image:linear-gradient(90deg, #111111, #333333)');
    expect(plan.backgroundHtml).toContain('background-size:cover');
    expect(plan.backgroundHtml).toContain('background-position:center');
    expect(plan.backgroundHtml).toContain('background-repeat:no-repeat');
  });

  it('classifies background-image shapes into hybrid background fallback', () => {
    const planner = new DocumentExportPlanner();
    const slide = makeSlide();
    slide.document!.elements = [
      {
        id: 'gradient-card',
        kind: 'shape',
        x: 80,
        y: 100,
        width: 640,
        height: 360,
        rotation: 0,
        zIndex: 0,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        selector: 'div.card',
        shapeType: 'rectangle',
        style: {
          backgroundImage: 'linear-gradient(180deg, #111111, #2a2a2a)',
          backgroundSize: 'cover',
        },
      },
      {
        id: 'native-title',
        kind: 'text',
        x: 120,
        y: 140,
        width: 300,
        height: 50,
        rotation: 0,
        zIndex: 1,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        selector: 'h2.title',
        text: 'Editable title',
        paragraphs: [{ text: 'Editable title', runs: [{ text: 'Editable title' }] }],
        editId: 'native-title',
        style: {
          color: '#ffffff',
          fontSize: 32,
        },
      },
    ];

    const plan = planner.plan(slide, slide.document!, { allowRuntimeBackgroundFallback: true });

    expect(plan.usedBackgroundFallback).toBe(true);
    expect(plan.document.elements[0].exportDisposition).toBe('background');
    expect(plan.nativeElements).toHaveLength(1);
    expect(plan.nativeElements[0].kind).toBe('text');
  });
});
