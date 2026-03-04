import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createStorage } from '../../../src/storage/factory.js';
import { InMemorySoulStore } from '../../../src/storage/memory/soul-store.js';
import { InMemoryDeckStore } from '../../../src/storage/memory/deck-store.js';
import { InMemorySlideStore } from '../../../src/storage/memory/slide-store.js';
import { FileSoulStore } from '../../../src/storage/file/soul-store.js';
import { FileDeckStore } from '../../../src/storage/file/deck-store.js';
import { FileSlideStore } from '../../../src/storage/file/slide-store.js';

describe('createStorage', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pengui-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return in-memory stores when no persistDir is provided', () => {
    const storage = createStorage();
    expect(storage.soulStore).toBeInstanceOf(InMemorySoulStore);
    expect(storage.deckStore).toBeInstanceOf(InMemoryDeckStore);
    expect(storage.slideStore).toBeInstanceOf(InMemorySlideStore);
  });

  it('should return in-memory stores when persistDir is undefined', () => {
    const storage = createStorage(undefined);
    expect(storage.soulStore).toBeInstanceOf(InMemorySoulStore);
    expect(storage.deckStore).toBeInstanceOf(InMemoryDeckStore);
    expect(storage.slideStore).toBeInstanceOf(InMemorySlideStore);
  });

  it('should return file-based stores when persistDir is provided', () => {
    const storage = createStorage(tmpDir);
    expect(storage.soulStore).toBeInstanceOf(FileSoulStore);
    expect(storage.deckStore).toBeInstanceOf(FileDeckStore);
    expect(storage.slideStore).toBeInstanceOf(FileSlideStore);
  });

  it('should return a StorageProvider with all three stores', () => {
    const storage = createStorage();
    expect(storage).toHaveProperty('soulStore');
    expect(storage).toHaveProperty('deckStore');
    expect(storage).toHaveProperty('slideStore');
  });

  it('file-based stores should be functional', async () => {
    const storage = createStorage(tmpDir);

    // Quick smoke test: save and retrieve through the interface
    const soul = {
      id: 'test-soul' as any,
      name: 'Test',
      description: 'Test soul',
      status: 'draft' as const,
      layers: {
        color: {
          canvas: '#fff', surface: '#f5f5f5', surfaceAlt: '#eee', border: '#ddd',
          textPrimary: '#111', textSecondary: '#555', textTertiary: '#999', textInverse: '#fff',
          accentPrimary: '#0066cc', accentSecondary: '#cc6600', accentWarm: '#cc0000',
          success: '#00cc66', warning: '#cccc00', error: '#cc0000', info: '#0099cc',
        },
        typography: {
          fontDisplay: 'Inter', fontBody: 'Inter', fontMono: 'Fira Code',
          sizeHero: 72, sizeH1: 48, sizeH2: 36, sizeH3: 28, sizeBody: 18, sizeLabel: 14, sizeCaption: 12,
          weightNormal: 400, weightMedium: 500, weightBold: 700,
          lineHeightHeading: 1.2, lineHeightBody: 1.6,
          letterSpacingHeading: '-0.02em', letterSpacingBody: '0',
        },
        spacing: {
          baseUnit: 8, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64, safeAreaInset: 48,
        },
        shape: {
          none: '0', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px',
          buttonRadius: '8px', cardRadius: '12px', inputRadius: '8px', badgeRadius: '9999px',
        },
        depth: {
          shadowNone: 'none', shadowSoft: '0 1px 2px rgba(0,0,0,0.05)',
          shadowMedium: '0 4px 6px rgba(0,0,0,0.1)', shadowElevated: '0 10px 15px rgba(0,0,0,0.15)',
          shadowInner: 'inset 0 2px 4px rgba(0,0,0,0.06)', borderWidth: '1px', borderOpacity: 0.1,
        },
        components: {
          cardPadding: '24px', cardShadow: '0 4px 6px rgba(0,0,0,0.1)', cardBorderWidth: '1px',
          buttonPaddingX: '16px', buttonPaddingY: '8px',
          inputPaddingX: '12px', inputPaddingY: '8px', inputBorderWidth: '1px',
          badgePaddingX: '8px', badgePaddingY: '4px',
        },
        motion: {
          durationFast: '100ms', durationNormal: '200ms', durationSlow: '300ms',
          easingDefault: 'ease-out', easingEmphasized: 'cubic-bezier(0.2, 0, 0, 1)',
          northStar: 'Clean', doRules: [], dontRules: [],
        },
      },
      cssTokens: '',
      tokenNames: [],
      allowedFonts: ['Inter'],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    await storage.soulStore.save(soul);
    const retrieved = await storage.soulStore.get('test-soul' as any);
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Test');
  });
});
