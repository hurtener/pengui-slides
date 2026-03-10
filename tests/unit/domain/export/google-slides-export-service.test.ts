import { describe, expect, it, vi } from 'vitest';
import { GoogleSlidesExportService } from '../../../../src/domain/export/google-slides-export-service.js';
import { loadConfig } from '../../../../src/config.js';
import { Logger } from '../../../../src/infrastructure/logger.js';
import type { Slide } from '../../../../src/types/deck.js';

function makeDocumentSlide(): Slide {
  return {
    id: 'slide-1' as never,
    deckId: 'deck-1' as never,
    position: 0,
    html: '<div class="slide"></div>',
    sourceKind: 'document_v1',
    translationIssues: [],
    document: {
      version: '1',
      sourceRevisionHash: 'rev-1',
      width: 1920,
      height: 1080,
      backgroundColor: 'rgb(255, 255, 255)',
      elements: [
        {
          id: 'shape-1',
          kind: 'shape',
          x: 120,
          y: 140,
          width: 600,
          height: 220,
          rotation: 0,
          zIndex: 0,
          opacity: 1,
          locked: false,
          exportDisposition: 'native',
          shapeType: 'roundRectangle',
          style: {
            backgroundColor: 'rgb(240, 240, 240)',
            borderColor: 'rgb(20, 20, 20)',
            borderWidth: 1,
          },
        },
        {
          id: 'text-1',
          kind: 'text',
          x: 160,
          y: 200,
          width: 500,
          height: 80,
          rotation: 0,
          zIndex: 1,
          opacity: 1,
          locked: false,
          exportDisposition: 'native',
          text: 'Hello editable world',
          paragraphs: [{ text: 'Hello editable world', runs: [{ text: 'Hello editable world' }] }],
          editId: 'text-1',
          style: {
            color: 'rgb(12, 24, 48)',
            fontFamily: 'Inter, sans-serif',
            fontSize: 32,
            fontWeight: 700,
            textAlign: 'left',
          },
        },
      ],
    },
    metadata: {
      title: 'Export Slide',
      type: 'content',
      narrative: 'Narrative',
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

function makeServices() {
  return {
    renderService: {
      renderSlideHtml: vi.fn(),
    },
    slideDocumentService: {
      render: vi.fn(),
    },
  };
}

describe('GoogleSlidesExportService', () => {
  it('creates a presentation and emits on-canvas editable shape/text requests in EMUs', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        presentationId: 'pres-123',
        slides: [{ objectId: 'default-slide' }],
        pageSize: {
          width: { magnitude: 9144000, unit: 'EMU' },
          height: { magnitude: 5143500, unit: 'EMU' },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [
          {
            slideProperties: {
              notesPage: {
                notesProperties: {
                  speakerNotesObjectId: 'notes-1',
                },
              },
            },
          },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [
          {
            objectId: 'slide_1_slide_1',
            pageElements: [
              {
                objectId: 'shape',
                size: {
                  width: { magnitude: 5715000, unit: 'EMU' },
                  height: { magnitude: 2095500, unit: 'EMU' },
                },
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: 1143000,
                  translateY: 1333500,
                  unit: 'EMU',
                },
              },
              {
                objectId: 'text',
                size: {
                  width: { magnitude: 4762500, unit: 'EMU' },
                  height: { magnitude: 762000, unit: 'EMU' },
                },
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: 1524000,
                  translateY: 1905000,
                  unit: 'EMU',
                },
              },
            ],
          },
        ],
      }), { status: 200 }));

    const { renderService, slideDocumentService } = makeServices();
    const service = new GoogleSlidesExportService(
      loadConfig({ googleAccessToken: 'token-123' }),
      new Logger('test', 'error'),
      renderService as never,
      slideDocumentService as never,
      fetchMock,
    );

    const result = await service.export([makeDocumentSlide()], 'Editable Deck');

    expect(result.presentationId).toBe('pres-123');
    expect(result.presentationUrl).toContain('pres-123');
    expect(result.slides).toEqual([
      {
        slideId: 'slide-1',
        title: 'Export Slide',
        mode: 'native_only',
        nativeObjectCount: 2,
        usedBackgroundFallback: false,
      },
    ]);

    const batchUpdateCall = fetchMock.mock.calls[1];
    expect(batchUpdateCall?.[0]).toContain(':batchUpdate');
    const batchBody = JSON.parse(String(batchUpdateCall?.[1]?.body));
    const textRequest = batchBody.requests.find((request: Record<string, unknown>) => 'createShape' in request && (request.createShape as Record<string, unknown>).shapeType === 'TEXT_BOX') as Record<string, unknown>;
    expect(textRequest).toBeTruthy();
    const textProps = (textRequest.createShape as Record<string, unknown>).elementProperties as Record<string, unknown>;
    expect(textProps.size).toEqual({
      width: { magnitude: expect.any(Number), unit: 'EMU' },
      height: { magnitude: expect.any(Number), unit: 'EMU' },
    });
    expect(((textProps.size as Record<string, unknown>).width as Record<string, unknown>).magnitude as number).toBeGreaterThan(2381250);
    expect(((textProps.size as Record<string, unknown>).height as Record<string, unknown>).magnitude as number).toBeGreaterThan(381000);
    expect(textProps.transform).toEqual({
      scaleX: 1,
      scaleY: 1,
      translateX: 762000,
      translateY: expect.any(Number),
      unit: 'EMU',
    });
    expect((textProps.transform as Record<string, unknown>).translateY as number).toBeLessThan(952500);
  });

  it('uploads a rendered background image when a slide needs fallback', async () => {
    const slide = makeDocumentSlide();
    slide.document!.backgroundImage = 'linear-gradient(rgb(10, 20, 30), rgb(40, 50, 60))';
    slide.document!.elements[0] = {
      ...slide.document!.elements[0],
      exportDisposition: 'background',
      fallbackReason: 'unsupported-shadow',
    };

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        presentationId: 'pres-123',
        slides: [{ objectId: 'default-slide' }],
        pageSize: {
          width: { magnitude: 9144000, unit: 'EMU' },
          height: { magnitude: 5143500, unit: 'EMU' },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'drive-file-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [
          {
            slideProperties: {
              notesPage: {
                notesProperties: {
                  speakerNotesObjectId: 'notes-1',
                },
              },
            },
          },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [
          {
            objectId: 'slide_1_slide_1',
            pageElements: [
              {
                objectId: 'background',
                size: {
                  width: { magnitude: 9144000, unit: 'EMU' },
                  height: { magnitude: 5143500, unit: 'EMU' },
                },
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: 0,
                  translateY: 0,
                  unit: 'EMU',
                },
              },
              {
                objectId: 'text',
                size: {
                  width: { magnitude: 4762500, unit: 'EMU' },
                  height: { magnitude: 762000, unit: 'EMU' },
                },
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: 1524000,
                  translateY: 1905000,
                  unit: 'EMU',
                },
              },
            ],
          },
        ],
      }), { status: 200 }));

    const { renderService, slideDocumentService } = makeServices();
    slideDocumentService.render.mockReturnValue('<html>background</html>');
    renderService.renderSlideHtml.mockResolvedValue({
      slideId: 'slide-1-background',
      imageData: Buffer.from('png'),
      format: 'png',
      width: 1920,
      height: 1080,
      renderTimeMs: 5,
    });

    const service = new GoogleSlidesExportService(
      loadConfig({ googleAccessToken: 'token-123' }),
      new Logger('test', 'error'),
      renderService as never,
      slideDocumentService as never,
      fetchMock,
    );

    const result = await service.export([slide], 'Editable Deck');

    expect(slideDocumentService.render).toHaveBeenCalledWith(slide.document, {
      includeDispositions: ['background'],
    });
    expect(renderService.renderSlideHtml).toHaveBeenCalled();
    expect(result.slides[0]).toEqual({
      slideId: 'slide-1',
      title: 'Export Slide',
      mode: 'hybrid_background',
      nativeObjectCount: 1,
      usedBackgroundFallback: true,
    });

    const batchUpdateCall = fetchMock.mock.calls[3];
    const batchBody = JSON.parse(String(batchUpdateCall?.[1]?.body));
    expect(batchBody.requests.some((request: Record<string, unknown>) => 'createImage' in request)).toBe(true);
  });

  it('widens short large single-line text frames to avoid Google Slides wrapping', async () => {
    const slide = makeDocumentSlide();
    slide.document!.elements = [
      {
        id: 'metric-1',
        kind: 'text',
        x: 1100,
        y: 420,
        width: 80,
        height: 32,
        rotation: 0,
        zIndex: 1,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        text: '2,500+',
        paragraphs: [{ text: '2,500+', runs: [{ text: '2,500+' }] }],
        editId: 'metric-1',
        style: {
          color: 'rgb(255, 255, 255)',
          fontFamily: 'Inter, sans-serif',
          fontSize: 28,
          fontWeight: 500,
          lineHeight: 32.2,
          textAlign: 'left',
        },
      },
    ];

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        presentationId: 'pres-123',
        slides: [{ objectId: 'default-slide' }],
        pageSize: {
          width: { magnitude: 9144000, unit: 'EMU' },
          height: { magnitude: 5143500, unit: 'EMU' },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [
          {
            slideProperties: {
              notesPage: {
                notesProperties: {
                  speakerNotesObjectId: 'notes-1',
                },
              },
            },
          },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [
          {
            objectId: 'slide_1_slide_1',
            pageElements: [
              {
                objectId: 'metric',
                size: {
                  width: { magnitude: 1143000, unit: 'EMU' },
                  height: { magnitude: 381000, unit: 'EMU' },
                },
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: 5238750,
                  translateY: 2000250,
                  unit: 'EMU',
                },
              },
            ],
          },
        ],
      }), { status: 200 }));

    const { renderService, slideDocumentService } = makeServices();
    const service = new GoogleSlidesExportService(
      loadConfig({ googleAccessToken: 'token-123' }),
      new Logger('test', 'error'),
      renderService as never,
      slideDocumentService as never,
      fetchMock,
    );

    await service.export([slide], 'Editable Deck');

    const batchUpdateCall = fetchMock.mock.calls[1];
    const batchBody = JSON.parse(String(batchUpdateCall?.[1]?.body));
    const textRequest = batchBody.requests.find((request: Record<string, unknown>) => (
      'createShape' in request
      && (request.createShape as Record<string, unknown>).shapeType === 'TEXT_BOX'
    )) as Record<string, unknown>;
    const textProps = (textRequest.createShape as Record<string, unknown>).elementProperties as Record<string, unknown>;
    const widthMagnitude = ((textProps.size as Record<string, unknown>).width as Record<string, unknown>).magnitude as number;

    expect(widthMagnitude).toBeGreaterThan(1000000);
  });

  it('widens compact monospace labels so Google Slides does not wrap them at spaces', async () => {
    const slide = makeDocumentSlide();
    slide.document!.elements = [
      {
        id: 'mono-1',
        kind: 'text',
        x: 88,
        y: 397,
        width: 56,
        height: 17,
        rotation: 0,
        zIndex: 1,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        text: 'APR 2026',
        paragraphs: [{ text: 'APR 2026', runs: [{ text: 'APR 2026' }] }],
        editId: 'mono-1',
        style: {
          color: 'rgb(253, 49, 46)',
          fontFamily: 'JetBrains Mono',
          fontSize: 14,
          fontWeight: 500,
          lineHeight: 22.4,
          textAlign: 'left',
        },
      },
    ];

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        presentationId: 'pres-123',
        slides: [{ objectId: 'default-slide' }],
        pageSize: {
          width: { magnitude: 9144000, unit: 'EMU' },
          height: { magnitude: 5143500, unit: 'EMU' },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [{ slideProperties: { notesPage: { notesProperties: { speakerNotesObjectId: 'notes-1' } } } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [{
          objectId: 'slide_1_slide_1',
          pageElements: [{
            objectId: 'mono',
            size: { width: { magnitude: 600000, unit: 'EMU' }, height: { magnitude: 200000, unit: 'EMU' } },
            transform: { scaleX: 1, scaleY: 1, translateX: 400000, translateY: 1800000, unit: 'EMU' },
          }],
        }],
      }), { status: 200 }));

    const { renderService, slideDocumentService } = makeServices();
    const service = new GoogleSlidesExportService(
      loadConfig({ googleAccessToken: 'token-123' }),
      new Logger('test', 'error'),
      renderService as never,
      slideDocumentService as never,
      fetchMock,
    );

    await service.export([slide], 'Editable Deck');

    const batchUpdateCall = fetchMock.mock.calls[1];
    const batchBody = JSON.parse(String(batchUpdateCall?.[1]?.body));
    const textRequest = batchBody.requests.find((request: Record<string, unknown>) => (
      'createShape' in request
      && (request.createShape as Record<string, unknown>).shapeType === 'TEXT_BOX'
    )) as Record<string, unknown>;
    const textProps = (textRequest.createShape as Record<string, unknown>).elementProperties as Record<string, unknown>;
    const widthMagnitude = ((textProps.size as Record<string, unknown>).width as Record<string, unknown>).magnitude as number;

    expect(widthMagnitude).toBeGreaterThan(350000);
  });

  it('tightens short styled badges so inline pills do not become full-width bars', async () => {
    const slide = makeDocumentSlide();
    slide.document!.elements = [
      {
        id: 'badge-1',
        kind: 'text',
        x: 80,
        y: 520,
        width: 180,
        height: 28,
        rotation: 0,
        zIndex: 1,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        text: 'P0 - CORE',
        paragraphs: [{ text: 'P0 - CORE', runs: [{ text: 'P0 - CORE' }] }],
        editId: 'badge-1',
        style: {
          backgroundColor: 'rgb(245, 245, 245)',
          color: 'rgb(165, 0, 52)',
          borderRadius: 9999,
          fontFamily: 'Inter, sans-serif',
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 19.2,
          paddingTop: 4,
          paddingRight: 12,
          paddingBottom: 4,
          paddingLeft: 12,
          textAlign: 'left',
        },
      },
    ];

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        presentationId: 'pres-123',
        slides: [{ objectId: 'default-slide' }],
        pageSize: {
          width: { magnitude: 9144000, unit: 'EMU' },
          height: { magnitude: 5143500, unit: 'EMU' },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [
          {
            slideProperties: {
              notesPage: {
                notesProperties: {
                  speakerNotesObjectId: 'notes-1',
                },
              },
            },
          },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [
          {
            objectId: 'slide_1_slide_1',
            pageElements: [
              {
                objectId: 'badge-background',
                size: {
                  width: { magnitude: 800000, unit: 'EMU' },
                  height: { magnitude: 266700, unit: 'EMU' },
                },
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: 381000,
                  translateY: 2476500,
                  unit: 'EMU',
                },
              },
              {
                objectId: 'badge-text',
                size: {
                  width: { magnitude: 800000, unit: 'EMU' },
                  height: { magnitude: 266700, unit: 'EMU' },
                },
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: 381000,
                  translateY: 2476500,
                  unit: 'EMU',
                },
              },
            ],
          },
        ],
      }), { status: 200 }));

    const { renderService, slideDocumentService } = makeServices();
    const service = new GoogleSlidesExportService(
      loadConfig({ googleAccessToken: 'token-123' }),
      new Logger('test', 'error'),
      renderService as never,
      slideDocumentService as never,
      fetchMock,
    );

    await service.export([slide], 'Editable Deck');

    const batchUpdateCall = fetchMock.mock.calls[1];
    const batchBody = JSON.parse(String(batchUpdateCall?.[1]?.body));
    const backgroundRequest = batchBody.requests.find((request: Record<string, unknown>) => (
      'createShape' in request
      && (request.createShape as Record<string, unknown>).shapeType === 'ROUND_RECTANGLE'
    )) as Record<string, unknown>;
    const backgroundProps = (backgroundRequest.createShape as Record<string, unknown>).elementProperties as Record<string, unknown>;
    const widthMagnitude = ((backgroundProps.size as Record<string, unknown>).width as Record<string, unknown>).magnitude as number;

    expect(widthMagnitude).toBeLessThan(1200000);
  });

  it('keeps long body copy near its original width so it can wrap inside cards', async () => {
    const slide = makeDocumentSlide();
    slide.document!.elements = [
      {
        id: 'body-1',
        kind: 'text',
        x: 80,
        y: 480,
        width: 540,
        height: 58,
        rotation: 0,
        zIndex: 1,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        text: 'Unified control plane for coordinating agent fleets with dependency-aware scheduling and rollback.',
        paragraphs: [{
          text: 'Unified control plane for coordinating agent fleets with dependency-aware scheduling and rollback.',
          runs: [{ text: 'Unified control plane for coordinating agent fleets with dependency-aware scheduling and rollback.' }],
        }],
        editId: 'body-1',
        style: {
          color: 'rgba(255, 255, 255, 0.7)',
          fontFamily: 'Inter, sans-serif',
          fontSize: 18,
          fontWeight: 400,
          lineHeight: 28.8,
          textAlign: 'left',
        },
      },
    ];

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        presentationId: 'pres-123',
        slides: [{ objectId: 'default-slide' }],
        pageSize: {
          width: { magnitude: 9144000, unit: 'EMU' },
          height: { magnitude: 5143500, unit: 'EMU' },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [
          {
            slideProperties: {
              notesPage: {
                notesProperties: {
                  speakerNotesObjectId: 'notes-1',
                },
              },
            },
          },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [
          {
            objectId: 'slide_1_slide_1',
            pageElements: [
              {
                objectId: 'body',
                size: {
                  width: { magnitude: 2700000, unit: 'EMU' },
                  height: { magnitude: 600000, unit: 'EMU' },
                },
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: 381000,
                  translateY: 2286000,
                  unit: 'EMU',
                },
              },
            ],
          },
        ],
      }), { status: 200 }));

    const { renderService, slideDocumentService } = makeServices();
    const service = new GoogleSlidesExportService(
      loadConfig({ googleAccessToken: 'token-123' }),
      new Logger('test', 'error'),
      renderService as never,
      slideDocumentService as never,
      fetchMock,
    );

    await service.export([slide], 'Editable Deck');

    const batchUpdateCall = fetchMock.mock.calls[1];
    const batchBody = JSON.parse(String(batchUpdateCall?.[1]?.body));
    const textRequest = batchBody.requests.find((request: Record<string, unknown>) => (
      'createShape' in request
      && (request.createShape as Record<string, unknown>).shapeType === 'TEXT_BOX'
    )) as Record<string, unknown>;
    const textProps = (textRequest.createShape as Record<string, unknown>).elementProperties as Record<string, unknown>;
    const widthMagnitude = ((textProps.size as Record<string, unknown>).width as Record<string, unknown>).magnitude as number;

    expect(widthMagnitude).toBeLessThan(2700000);
  });

  it('preserves stretched badge backgrounds instead of tightening them to intrinsic text width', async () => {
    const slide = makeDocumentSlide();
    slide.document!.elements = [
      {
        id: 'badge-stretch-1',
        kind: 'text',
        x: 80,
        y: 520,
        width: 540,
        height: 28,
        rotation: 0,
        zIndex: 1,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        text: 'AGENTS',
        paragraphs: [{ text: 'AGENTS', runs: [{ text: 'AGENTS' }] }],
        editId: 'badge-stretch-1',
        style: {
          backgroundColor: 'rgb(245, 245, 245)',
          color: 'rgb(165, 0, 52)',
          borderRadius: 9999,
          fontFamily: 'Inter, sans-serif',
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 19.2,
          paddingTop: 4,
          paddingRight: 12,
          paddingBottom: 4,
          paddingLeft: 12,
          stretchX: true,
          textAlign: 'left',
        },
      },
    ];

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        presentationId: 'pres-123',
        slides: [{ objectId: 'default-slide' }],
        pageSize: {
          width: { magnitude: 9144000, unit: 'EMU' },
          height: { magnitude: 5143500, unit: 'EMU' },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [
          {
            slideProperties: {
              notesPage: {
                notesProperties: {
                  speakerNotesObjectId: 'notes-1',
                },
              },
            },
          },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [
          {
            objectId: 'slide_1_slide_1',
            pageElements: [
              {
                objectId: 'badge-background',
                size: {
                  width: { magnitude: 2571750, unit: 'EMU' },
                  height: { magnitude: 133350, unit: 'EMU' },
                },
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: 381000,
                  translateY: 2476500,
                  unit: 'EMU',
                },
              },
              {
                objectId: 'badge-text',
                size: {
                  width: { magnitude: 2457450, unit: 'EMU' },
                  height: { magnitude: 133350, unit: 'EMU' },
                },
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: 438150,
                  translateY: 2514600,
                  unit: 'EMU',
                },
              },
            ],
          },
        ],
      }), { status: 200 }));

    const { renderService, slideDocumentService } = makeServices();
    const service = new GoogleSlidesExportService(
      loadConfig({ googleAccessToken: 'token-123' }),
      new Logger('test', 'error'),
      renderService as never,
      slideDocumentService as never,
      fetchMock,
    );

    await service.export([slide], 'Editable Deck');

    const batchUpdateCall = fetchMock.mock.calls[1];
    const batchBody = JSON.parse(String(batchUpdateCall?.[1]?.body));
    const backgroundRequest = batchBody.requests.find((request: Record<string, unknown>) => (
      'createShape' in request
      && (request.createShape as Record<string, unknown>).shapeType === 'ROUND_RECTANGLE'
    )) as Record<string, unknown>;
    const backgroundProps = (backgroundRequest.createShape as Record<string, unknown>).elementProperties as Record<string, unknown>;
    const widthMagnitude = ((backgroundProps.size as Record<string, unknown>).width as Record<string, unknown>).magnitude as number;

    expect(widthMagnitude).toBeGreaterThan(2000000);
  });

  it('centers single-line split text vertically within its background shape', async () => {
    const slide = makeDocumentSlide();
    slide.document!.elements = [
      {
        id: 'badge-center-1',
        kind: 'text',
        x: 80,
        y: 520,
        width: 540,
        height: 28,
        rotation: 0,
        zIndex: 1,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        text: 'AGENTS',
        paragraphs: [{ text: 'AGENTS', runs: [{ text: 'AGENTS' }] }],
        editId: 'badge-center-1',
        style: {
          backgroundColor: 'rgb(245, 245, 245)',
          color: 'rgb(165, 0, 52)',
          borderRadius: 9999,
          fontFamily: 'Inter, sans-serif',
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 19.2,
          paddingTop: 4,
          paddingRight: 12,
          paddingBottom: 4,
          paddingLeft: 12,
          stretchX: true,
          textAlign: 'left',
        },
      },
    ];

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        presentationId: 'pres-123',
        slides: [{ objectId: 'default-slide' }],
        pageSize: {
          width: { magnitude: 9144000, unit: 'EMU' },
          height: { magnitude: 5143500, unit: 'EMU' },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [{ slideProperties: { notesPage: { notesProperties: { speakerNotesObjectId: 'notes-1' } } } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [{
          objectId: 'slide_1_slide_1',
          pageElements: [
            {
              objectId: 'badge-background',
              size: { width: { magnitude: 2571750, unit: 'EMU' }, height: { magnitude: 133350, unit: 'EMU' } },
              transform: { scaleX: 1, scaleY: 1, translateX: 381000, translateY: 2476500, unit: 'EMU' },
            },
            {
              objectId: 'badge-text',
              size: { width: { magnitude: 2457450, unit: 'EMU' }, height: { magnitude: 133350, unit: 'EMU' } },
              transform: { scaleX: 1, scaleY: 1, translateX: 438150, translateY: 2476500, unit: 'EMU' },
            },
          ],
        }],
      }), { status: 200 }));

    const { renderService, slideDocumentService } = makeServices();
    const service = new GoogleSlidesExportService(
      loadConfig({ googleAccessToken: 'token-123' }),
      new Logger('test', 'error'),
      renderService as never,
      slideDocumentService as never,
      fetchMock,
    );

    await service.export([slide], 'Editable Deck');

    const batchUpdateCall = fetchMock.mock.calls[1];
    const batchBody = JSON.parse(String(batchUpdateCall?.[1]?.body));
    const shapeUpdate = batchBody.requests.find((request: Record<string, unknown>) => (
      'updateShapeProperties' in request
      && (request.updateShapeProperties as Record<string, unknown>).objectId === 'slide_1_slide_1_txt_badge_center_1_content'
    )) as Record<string, unknown> | undefined;

    expect(shapeUpdate).toBeTruthy();
    expect(((shapeUpdate!.updateShapeProperties as Record<string, unknown>).shapeProperties as Record<string, unknown>).contentAlignment).toBe('MIDDLE');
  });

  it('widens large centered single-line titles so Google Slides does not break the last word', async () => {
    const slide = makeDocumentSlide();
    slide.document!.elements = [
      {
        id: 'title-1',
        kind: 'text',
        x: 708,
        y: 495,
        width: 504,
        height: 55,
        rotation: 0,
        zIndex: 1,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        text: 'Join the AI Platform Beta',
        paragraphs: [{ text: 'Join the AI Platform Beta', runs: [{ text: 'Join the AI Platform Beta' }] }],
        editId: 'title-1',
        style: {
          color: 'rgb(255, 255, 255)',
          fontFamily: 'Inter, sans-serif',
          fontSize: 48,
          fontWeight: 700,
          lineHeight: 55.2,
          textAlign: 'center',
        },
      },
    ];

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        presentationId: 'pres-123',
        slides: [{ objectId: 'default-slide' }],
        pageSize: {
          width: { magnitude: 9144000, unit: 'EMU' },
          height: { magnitude: 5143500, unit: 'EMU' },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [{ slideProperties: { notesPage: { notesProperties: { speakerNotesObjectId: 'notes-1' } } } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [{
          objectId: 'slide_1_slide_1',
          pageElements: [{
            objectId: 'title',
            size: { width: { magnitude: 3200000, unit: 'EMU' }, height: { magnitude: 500000, unit: 'EMU' } },
            transform: { scaleX: 1, scaleY: 1, translateX: 3000000, translateY: 2300000, unit: 'EMU' },
          }],
        }],
      }), { status: 200 }));

    const { renderService, slideDocumentService } = makeServices();
    const service = new GoogleSlidesExportService(
      loadConfig({ googleAccessToken: 'token-123' }),
      new Logger('test', 'error'),
      renderService as never,
      slideDocumentService as never,
      fetchMock,
    );

    await service.export([slide], 'Editable Deck');

    const batchUpdateCall = fetchMock.mock.calls[1];
    const batchBody = JSON.parse(String(batchUpdateCall?.[1]?.body));
    const textRequest = batchBody.requests.find((request: Record<string, unknown>) => (
      'createShape' in request
      && (request.createShape as Record<string, unknown>).shapeType === 'TEXT_BOX'
    )) as Record<string, unknown>;
    const textProps = (textRequest.createShape as Record<string, unknown>).elementProperties as Record<string, unknown>;
    const widthMagnitude = ((textProps.size as Record<string, unknown>).width as Record<string, unknown>).magnitude as number;

    expect(widthMagnitude).toBeGreaterThan(2900000);
  });

  it('adds extra height for visually wrapped body text even when the source has no hard line breaks', async () => {
    const slide = makeDocumentSlide();
    slide.document!.elements = [
      {
        id: 'body-wrap-1',
        kind: 'text',
        x: 73,
        y: 484,
        width: 542,
        height: 57.6,
        rotation: 0,
        zIndex: 1,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        text: 'Unified control plane for coordinating agent fleets with dependency-aware scheduling and rollback.',
        paragraphs: [{
          text: 'Unified control plane for coordinating agent fleets with dependency-aware scheduling and rollback.',
          runs: [{ text: 'Unified control plane for coordinating agent fleets with dependency-aware scheduling and rollback.' }],
        }],
        editId: 'body-wrap-1',
        style: {
          color: 'rgba(255, 255, 255, 0.7)',
          fontFamily: 'Inter, sans-serif',
          fontSize: 18,
          fontWeight: 400,
          lineHeight: 28.8,
          textAlign: 'left',
        },
      },
    ];

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        presentationId: 'pres-123',
        slides: [{ objectId: 'default-slide' }],
        pageSize: {
          width: { magnitude: 9144000, unit: 'EMU' },
          height: { magnitude: 5143500, unit: 'EMU' },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [{ slideProperties: { notesPage: { notesProperties: { speakerNotesObjectId: 'notes-1' } } } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [{
          objectId: 'slide_1_slide_1',
          pageElements: [{
            objectId: 'body-wrap',
            size: { width: { magnitude: 2600000, unit: 'EMU' }, height: { magnitude: 800000, unit: 'EMU' } },
            transform: { scaleX: 1, scaleY: 1, translateX: 350000, translateY: 2300000, unit: 'EMU' },
          }],
        }],
      }), { status: 200 }));

    const { renderService, slideDocumentService } = makeServices();
    const service = new GoogleSlidesExportService(
      loadConfig({ googleAccessToken: 'token-123' }),
      new Logger('test', 'error'),
      renderService as never,
      slideDocumentService as never,
      fetchMock,
    );

    await service.export([slide], 'Editable Deck');

    const batchUpdateCall = fetchMock.mock.calls[1];
    const batchBody = JSON.parse(String(batchUpdateCall?.[1]?.body));
    const textRequest = batchBody.requests.find((request: Record<string, unknown>) => (
      'createShape' in request
      && (request.createShape as Record<string, unknown>).shapeType === 'TEXT_BOX'
    )) as Record<string, unknown>;
    const textProps = (textRequest.createShape as Record<string, unknown>).elementProperties as Record<string, unknown>;
    const heightMagnitude = ((textProps.size as Record<string, unknown>).height as Record<string, unknown>).magnitude as number;

    expect(heightMagnitude).toBeGreaterThan(330000);
  });

  it('uses background fallback for runtime-classified unsupported chrome when Drive upload scope is available', async () => {
    const slide = makeDocumentSlide();
    slide.document!.elements = [
      {
        id: 'divider-1',
        kind: 'shape',
        x: 49,
        y: 968,
        width: 590,
        height: 62,
        rotation: 0,
        zIndex: 1,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        shapeType: 'rectangle',
        style: {
          backgroundColor: 'rgba(0, 0, 0, 0)',
          borderColor: 'rgba(255, 255, 255, 0.12) rgb(255, 255, 255) rgb(255, 255, 255) rgb(255, 255, 255)',
          borderWidth: 1,
          borderStyle: 'solid dashed dotted double',
        },
      },
      {
        id: 'title-1',
        kind: 'text',
        x: 73,
        y: 305,
        width: 542,
        height: 32,
        rotation: 0,
        zIndex: 2,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        text: 'Multi-Agent Orchestrator',
        paragraphs: [{ text: 'Multi-Agent Orchestrator', runs: [{ text: 'Multi-Agent Orchestrator' }] }],
        editId: 'title-1',
        style: {
          color: 'rgb(255, 255, 255)',
          fontFamily: 'Inter, sans-serif',
          fontSize: 28,
          lineHeight: 32.2,
          textAlign: 'left',
        },
      },
    ];

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        presentationId: 'pres-123',
        slides: [{ objectId: 'default-slide' }],
        pageSize: {
          width: { magnitude: 9144000, unit: 'EMU' },
          height: { magnitude: 5143500, unit: 'EMU' },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        scope: 'https://www.googleapis.com/auth/presentations https://www.googleapis.com/auth/drive.file',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'drive-file-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [{ slideProperties: { notesPage: { notesProperties: { speakerNotesObjectId: 'notes-1' } } } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        slides: [{
          objectId: 'slide_1_slide_1',
          pageElements: [
            {
              objectId: 'background',
              size: { width: { magnitude: 9144000, unit: 'EMU' }, height: { magnitude: 5143500, unit: 'EMU' } },
              transform: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0, unit: 'EMU' },
            },
            {
              objectId: 'native-title',
              size: { width: { magnitude: 2500000, unit: 'EMU' }, height: { magnitude: 400000, unit: 'EMU' } },
              transform: { scaleX: 1, scaleY: 1, translateX: 300000, translateY: 1500000, unit: 'EMU' },
            },
          ],
        }],
      }), { status: 200 }));

    const { renderService, slideDocumentService } = makeServices();
    slideDocumentService.render.mockReturnValue('<html>background</html>');
    renderService.renderSlideHtml.mockResolvedValue({
      slideId: 'slide-1-background',
      imageData: Buffer.from('png'),
      format: 'png',
      width: 1920,
      height: 1080,
      renderTimeMs: 5,
    });

    const service = new GoogleSlidesExportService(
      loadConfig({ googleAccessToken: 'token-123' }),
      new Logger('test', 'error'),
      renderService as never,
      slideDocumentService as never,
      fetchMock,
    );

    const result = await service.export([slide], 'Editable Deck');

    expect(result.slides[0]?.mode).toBe('hybrid_background');
    expect(slideDocumentService.render).toHaveBeenCalledWith(expect.objectContaining({
      elements: expect.arrayContaining([
        expect.objectContaining({ id: 'divider-1', exportDisposition: 'background' }),
      ]),
    }), {
      includeDispositions: ['background'],
    });
  });
});
