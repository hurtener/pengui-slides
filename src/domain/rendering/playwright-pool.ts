/**
 * Playwright Browser Pool for Pengui Slides.
 *
 * Manages a singleton browser instance with a pool of reusable pages.
 * Playwright is dynamically imported to keep it as an optional dependency.
 */

// ── Types ────────────────────────────────────────────────────────

/** Opaque handle — callers should not depend on Playwright types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BrowserInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PageInstance = any;

// ── Pool Implementation ──────────────────────────────────────────

export class PlaywrightPool {
  private browser: BrowserInstance | null = null;
  private availablePages: PageInstance[] = [];
  private allPages = new Set<PageInstance>();
  private launching: Promise<BrowserInstance> | null = null;
  private readonly maxPoolSize: number;
  private readonly headless: boolean;
  private shuttingDown = false;

  constructor(options?: { maxPoolSize?: number; headless?: boolean }) {
    this.maxPoolSize = options?.maxPoolSize ?? 4;
    this.headless = options?.headless ?? true;
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * Acquire a Playwright Page from the pool.
   * Lazily launches the browser on first call.
   */
  async getPage(): Promise<PageInstance> {
    if (this.shuttingDown) {
      throw new Error('PlaywrightPool is shutting down');
    }

    const browser = await this.ensureBrowser();

    if (this.availablePages.length > 0) {
      return this.availablePages.pop()!;
    }

    const page = await browser.newPage();
    this.allPages.add(page);
    return page;
  }

  /**
   * Return a page to the pool for reuse.
   * If the pool is full the page is closed instead.
   */
  async releasePage(page: PageInstance): Promise<void> {
    try {
      if (this.shuttingDown) {
        await page.close({ runBeforeUnload: false });
        this.allPages.delete(page);
        return;
      }

      if (this.availablePages.length < this.maxPoolSize && !page.isClosed()) {
        this.availablePages.push(page);
      } else {
        await page.close({ runBeforeUnload: false });
        this.allPages.delete(page);
      }
    } catch {
      this.allPages.delete(page);
    }
  }

  /**
   * Shut down the browser and release all pooled pages.
   */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;

    await Promise.allSettled(
      Array.from(this.allPages).map(async (page) => {
        try {
          if (!page.isClosed()) {
            await page.close({ runBeforeUnload: false });
          }
        } catch {
          // ignore
        }
      }),
    );

    this.availablePages = [];
    this.allPages.clear();

    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // ignore
      }
      this.browser = null;
    }

    this.launching = null;
    this.shuttingDown = false;
  }

  // ── Internals ────────────────────────────────────────────────

  private async ensureBrowser(): Promise<BrowserInstance> {
    if (this.browser) {
      return this.browser;
    }

    // Coalesce concurrent launch requests
    if (!this.launching) {
      this.launching = this.launchBrowser();
    }

    return this.launching;
  }

  private async launchBrowser(): Promise<BrowserInstance> {
    const { chromium } = await import('playwright');
    this.browser = await chromium.launch({ headless: this.headless });
    return this.browser!;
  }
}
