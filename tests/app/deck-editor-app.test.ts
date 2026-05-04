// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import DeckEditorApp from '../../app/src/DeckEditorApp.svelte';
import type { DeckEditorBridge, EditorState, ToolCallResult } from '../../app/src/lib/types';

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  value: ResizeObserverStub,
  writable: true,
});

class MockBridge implements DeckEditorBridge {
  private toolInputHandlers = new Set<(args: Record<string, unknown>) => void>();
  private toolResultHandlers = new Set<(result: ToolCallResult<Record<string, unknown>>) => void>();
  public callResults = new Map<string, ToolCallResult<Record<string, unknown>>>();

  async connect(): Promise<void> {}

  onToolInput(handler: (args: Record<string, unknown>) => void): () => void {
    this.toolInputHandlers.add(handler);
    return () => this.toolInputHandlers.delete(handler);
  }

  onToolResult(handler: (result: ToolCallResult<Record<string, unknown>>) => void): () => void {
    this.toolResultHandlers.add(handler);
    return () => this.toolResultHandlers.delete(handler);
  }

  async callTool<TStructured>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolCallResult<TStructured>> {
    const key = `${name}:${JSON.stringify(args)}`;
    return (this.callResults.get(key) ?? { structuredContent: {} }) as ToolCallResult<TStructured>;
  }

  emitToolInput(args: Record<string, unknown>): void {
    this.toolInputHandlers.forEach((handler) => handler(args));
  }

  emitToolResult(result: ToolCallResult<Record<string, unknown>>): void {
    this.toolResultHandlers.forEach((handler) => handler(result));
  }
}

function makeState(selectedSlideId: string): EditorState {
  const selectedValidation = selectedSlideId === 'slide-1'
    ? {
        passed: false,
        issues: [{
          id: 'issue-1',
          stage: 'stage1_lint',
          severity: 'error' as const,
          rule: 'demo',
          message: 'Headline needs revision.',
        }],
        errorCount: 1,
        warningCount: 0,
        infoCount: 0,
        stage2Skipped: false,
        validatedAt: '2026-03-06T00:00:00.000Z',
      }
    : {
        passed: true,
        issues: [],
        errorCount: 0,
        warningCount: 0,
        infoCount: 0,
        stage2Skipped: false,
        validatedAt: '2026-03-06T00:00:00.000Z',
      };

  const selectedPresentation = selectedSlideId === 'slide-1'
    ? {
        status: 'edited_with_preexisting_issues' as const,
        headline: 'This slide still has 1 older issue.',
        blockingCount: 0,
        introducedCount: 0,
        preExistingCount: 1,
        resolvedCount: 0,
        topBlockers: [],
        topPreExisting: [{
          id: 'issue-1',
          stage: 'stage1_lint',
          severity: 'error' as const,
          rule: 'demo',
          message: 'Headline needs revision.',
        }],
        showTechnicalDetailsAvailable: true,
      }
    : {
        status: 'clean' as const,
        headline: 'No issues introduced by this edit.',
        blockingCount: 0,
        introducedCount: 0,
        preExistingCount: 0,
        resolvedCount: 0,
        topBlockers: [],
        topPreExisting: [],
        showTechnicalDetailsAvailable: false,
      };

  return {
    deck: {
      id: 'deck-1',
      soulId: 'soul-1',
      title: 'MCP Deck',
      author: 'Tester',
      slideCount: 2,
      slides: [
        { id: 'slide-1', position: 0, title: 'Slide One', type: 'content', isValid: false },
        { id: 'slide-2', position: 1, title: 'Slide Two', type: 'metrics', isValid: true, styleScore: 0.92 },
      ],
      revisionCount: 3,
      createdAt: '2026-03-06T00:00:00.000Z',
      updatedAt: '2026-03-06T00:00:00.000Z',
    },
    selectedSlide: {
      slideId: selectedSlideId,
      position: selectedSlideId === 'slide-1' ? 0 : 1,
      html: `<!DOCTYPE html><html><body><div class="slide"><p data-edit-id="text-1" data-ir-path="body,0">${selectedSlideId === 'slide-1' ? 'Alpha' : 'Beta'}</p></div></body></html>`,
      metadata: {
        title: selectedSlideId === 'slide-1' ? 'Slide One' : 'Slide Two',
        type: selectedSlideId === 'slide-1' ? 'content' : 'metrics',
        narrative: selectedSlideId === 'slide-1' ? 'Needs fixes' : 'Looks good',
        keyPoints: selectedSlideId === 'slide-1' ? ['One', 'Two'] : ['Three'],
        tags: selectedSlideId === 'slide-1' ? ['draft'] : ['ready'],
      },
      lastValidation: selectedValidation,
      validationPresentation: selectedPresentation,
      validationDelta: {
        introducedIssues: [],
        resolvedIssues: [],
        preExistingIssues: selectedSlideId === 'slide-1'
          ? [{
              id: 'issue-1',
              stage: 'stage1_lint',
              severity: 'error' as const,
              rule: 'demo',
              message: 'Headline needs revision.',
            }]
          : [],
        blockingIssues: [],
        status: selectedPresentation.status,
        summary: selectedPresentation.headline,
      },
      revisionHash: selectedSlideId === 'slide-1' ? 'hash-one' : 'hash-two',
    },
    thumbnails: [
      {
        slideId: 'slide-1',
        position: 0,
        title: 'Slide One',
        type: 'content',
        imageBase64: 'aGVsbG8=',
        isValid: false,
        health: 'needs_attention',
        hasNewIssues: false,
        blockingCount: 0,
        validationPresentation: {
          status: 'edited_with_preexisting_issues',
          headline: 'This slide still has 1 older issue.',
          blockingCount: 0,
          introducedCount: 0,
          preExistingCount: 1,
          resolvedCount: 0,
          topBlockers: [],
          topPreExisting: [{
            id: 'issue-1',
            stage: 'stage1_lint',
            severity: 'error',
            rule: 'demo',
            message: 'Headline needs revision.',
          }],
          showTechnicalDetailsAvailable: true,
        },
      },
      {
        slideId: 'slide-2',
        position: 1,
        title: 'Slide Two',
        type: 'metrics',
        imageBase64: 'd29ybGQ=',
        isValid: true,
        health: 'clean',
        hasNewIssues: false,
        blockingCount: 0,
        validationPresentation: {
          status: 'clean',
          headline: 'This slide is ready.',
          blockingCount: 0,
          introducedCount: 0,
          preExistingCount: 0,
          resolvedCount: 0,
          topBlockers: [],
          topPreExisting: [],
          showTechnicalDetailsAvailable: false,
        },
        styleScore: 0.92,
      },
    ],
    selectedPreview: {
      slideId: selectedSlideId,
      position: selectedSlideId === 'slide-1' ? 0 : 1,
      title: selectedSlideId === 'slide-1' ? 'Slide One' : 'Slide Two',
      type: selectedSlideId === 'slide-1' ? 'content' : 'metrics',
      imageBase64: selectedSlideId === 'slide-1' ? 'aGVsbG8=' : 'd29ybGQ=',
      isValid: selectedSlideId !== 'slide-1',
      health: selectedSlideId === 'slide-1' ? 'needs_attention' : 'clean',
      hasNewIssues: false,
      blockingCount: 0,
      validationPresentation: selectedPresentation,
      ...(selectedSlideId === 'slide-2' ? { styleScore: 0.92 } : {}),
    },
  };
}

describe('DeckEditorApp', () => {
  it('renders the slide list, swaps selection, and updates validation details', async () => {
    const bridge = new MockBridge();
    bridge.callResults.set(
      'get_editor_state:{"deck_id":"deck-1","slide_id":"slide-2"}',
      { structuredContent: { editor_state: makeState('slide-2') } },
    );

    const view = render(DeckEditorApp, { props: { bridge } });
    bridge.emitToolResult({ structuredContent: { editor_state: makeState('slide-1') } });

    await waitFor(() => {
      expect(view.getByRole('heading', { level: 2, name: 'Slide One' })).toBeTruthy();
      expect(view.queryByText('This slide still has 1 older issue.')).toBeNull();
      expect(view.queryByText('hash-one')).toBeNull();
    });

    await fireEvent.click(view.getByRole('button', { name: /slide details/i }));
    await fireEvent.click(view.getByRole('button', { name: /^checks$/i }));

    await waitFor(() => {
      expect(view.getByText('This slide still has 1 older issue.')).toBeTruthy();
    });

    await fireEvent.click(view.getByRole('button', { name: /2\. Slide Two/i }));

    await waitFor(() => {
      expect(view.getByRole('heading', { level: 2, name: 'Slide Two' })).toBeTruthy();
      expect(view.getAllByText('No issues introduced by this edit.').length).toBeGreaterThan(0);
      expect(view.getAllByText('Clean').length).toBeGreaterThan(0);
    });
  });

});
