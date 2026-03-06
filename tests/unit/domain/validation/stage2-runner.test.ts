import { describe, it, expect, afterAll } from 'vitest';
import type { BrowserContext, Page } from 'playwright';
import { chromium, type Browser } from 'playwright';
import { Stage2Runner } from '../../../../src/domain/validation/stage2/stage2-runner.js';

const validHtml = `<!DOCTYPE html>
<html><head><style>
  body { margin:0; background:#fff; }
  .slide { width:1920px; height:1080px; padding:48px; }
  h1 { color:#222; font-size:48px; }
  p { color:#333; font-size:24px; }
</style></head><body>
<div class="slide"><h1>Title</h1><p>Body text content</p></div>
</body></html>`;

describe('Stage2Runner', () => {
  let browser: Browser;
  let page: Page;
  const contexts: BrowserContext[] = [];

  afterAll(async () => {
    if (page && !page.isClosed()) await page.close();
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
    if (browser) await browser.close();
  }, 20000);

  it('runs stage 2 checks and returns issues', async () => {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    contexts.push(context);
    page = await context.newPage();
    await page.setContent(validHtml, { waitUntil: 'load' });

    const runner = new Stage2Runner();
    const result = await runner.run(page, ['--color-primary']);

    expect(Array.isArray(result.issues)).toBe(true);
    expect(typeof result.elapsedMs).toBe('number');
    // Each issue should have the expected structure
    for (const issue of result.issues) {
      expect(issue).toHaveProperty('id');
      expect(issue).toHaveProperty('severity');
      expect(issue).toHaveProperty('message');
    }
  });

  it('detects overflow content', async () => {
    const overflowHtml = `<!DOCTYPE html>
    <html><head><style>
      body { margin:0; }
      .slide { width:1920px; height:1080px; position:relative; }
      .overflow { position:absolute; top:2000px; left:0; width:100px; height:100px; background:red; }
    </style></head><body>
    <div class="slide"><div class="overflow">Overflow</div></div>
    </body></html>`;

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    contexts.push(context);
    const overflowPage = await context.newPage();
    await overflowPage.setContent(overflowHtml, { waitUntil: 'load' });

    const runner = new Stage2Runner();
    const result = await runner.run(overflowPage, []);

    await overflowPage.close();

    // Should find at least one overflow issue
    const overflowIssues = result.issues.filter((i) => i.id.startsWith('overflow-detector'));
    expect(overflowIssues.length).toBeGreaterThan(0);
  });
});
