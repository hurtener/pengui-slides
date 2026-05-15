/// <reference lib="dom" />

import type { AssetService } from '../assets/asset-service.js';
import { resolveAssetRefs } from '../assets/asset-resolver.js';
import type { Logger } from '../../infrastructure/logger.js';
import type {
  SlideExportDisposition,
  SlideDocument,
  SlideElement,
  SlideImageElement,
  SlideShapeElement,
  SlideTableCell,
  SlideTableElement,
  SlideTextElement,
  SlideTextRun,
  SlideTranslationIssue,
} from '../../types/slide-document.js';
import { CURRENT_COMPILER_REVISION } from '../../types/slide-document.js';

interface ExtractedDocumentPayload {
  width: number;
  height: number;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  elements: SlideElement[];
  issues: SlideTranslationIssue[];
}

export interface SlideDocumentCompilationResult {
  document: SlideDocument | null;
  issues: SlideTranslationIssue[];
}

export class HtmlSlideDocumentCompiler {
  constructor(
    private readonly logger: Logger,
    private readonly headless: boolean,
    private readonly assetService?: AssetService,
  ) {}

  async compile(html: string, sourceRevisionHash: string): Promise<SlideDocumentCompilationResult> {
    const resolvedHtml = this.assetService
      ? await resolveAssetRefs(html, this.assetService)
      : html;

    const payload = await this.extract(resolvedHtml);
    const blockingIssues = payload.issues.filter((issue) => issue.severity === 'error');

    if (blockingIssues.length > 0) {
      this.logger.warn('Slide document compilation blocked', {
        issueCount: blockingIssues.length,
      });
      return {
        document: null,
        issues: payload.issues,
      };
    }

    return {
      document: {
        version: '1',
        compilerRevision: CURRENT_COMPILER_REVISION,
        sourceRevisionHash,
        width: payload.width,
        height: payload.height,
        backgroundColor: payload.backgroundColor,
        backgroundImage: payload.backgroundImage,
        backgroundSize: payload.backgroundSize,
        backgroundPosition: payload.backgroundPosition,
        backgroundRepeat: payload.backgroundRepeat,
        elements: payload.elements,
      },
      issues: payload.issues,
    };
  }

  private async extract(html: string): Promise<ExtractedDocumentPayload> {
    const pw = await import('playwright');
    const browser = await pw.chromium.launch({ headless: this.headless });

    try {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.setContent(html, { waitUntil: 'load' });
      // Polyfill esbuild's `__name` helper inside the page context.
      // When this compiler is loaded by a runtime that emits
      // `--keep-names` shims (tsx, esbuild dev servers, some bundlers),
      // function expressions get wrapped in `__name(fn, "x")`. Playwright
      // serializes our evaluate fn via `.toString()` and ships it to
      // Chromium — without `__name` defined in the same evaluation realm
      // page.evaluate runs in, the first transformed identifier throws
      // ReferenceError. addInitScript lands in a different world, so
      // inject via addScriptTag (raw `content:` string) which runs in
      // the page's main world before our evaluate calls.
      await page.addScriptTag({
        content: 'if (typeof globalThis.__name !== "function") { globalThis.__name = function (fn) { return fn; }; }',
      });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

      const payload: ExtractedDocumentPayload = await page.evaluate(() => {
        const issues: SlideTranslationIssue[] = [];
        const root = document.querySelector<HTMLElement>('.slide');
        if (!root) {
          return {
            width: 1920,
            height: 1080,
            elements: [],
            issues: [{
              code: 'missing-slide-root',
              severity: 'error',
              message: 'Slide HTML is missing the required .slide root element.',
            }],
          };
        }

        const rootRect = root.getBoundingClientRect();
        const rootStyle = window.getComputedStyle(root);
        const rootBackground = rootStyle.backgroundColor;

        const elements: SlideElement[] = [];
        const tableHandled = new Set<Element>();
        // v4.12: chart figures emit a single background-disposed image
        // element; their inner SVG nodes (rect/path/text) must NOT be
        // walked individually or the editable PPTX export emits a
        // floating shape per SVG element on top of the chart raster.
        const chartHandled = new Set<Element>();
        // v4.18.1 — composite-visual nodes (cards, decorations, flow
        // steps/connectors, image frames) emit a single per-node PNG
        // snapshot taken via Playwright in a post-eval pass. The walker
        // tags each candidate with `data-snap-id` and pushes a placeholder
        // image element with src `pengui-snap://{id}`; descendants that
        // are NOT text leaves get marked so their structural rects don't
        // double up over the snapshot. Text leaves (eyebrow, heading,
        // body, label, badge) flow normally and emit as native text on
        // top of the snapshot — best of both worlds.
        const snapHandled = new Set<Element>();
        let snapCounter = 0;
        // v4.18.5 — `pengui-flow-connector` removed from SNAP_CLASSES.
        // The connector LI has no chrome (no border/background) — it's
        // just a flex container around an inline SVG arrow glyph. The
        // existing v4.14.5 inline-SVG-as-image branch already emits
        // those connectors as native <p:pic> shapes at the SVG's exact
        // bbox (32×32 within the LI's flex centering). Snapshotting
        // the LI captures the full row-height bounding box and shifts
        // the arrow to the visual bottom of the cell — visibly weird.
        // v4.20 — `pengui-card-section` joins the snap candidates as
        // it carries the same chrome (border, fill, header pill).
        // `pengui-arrow` is NOT a snap candidate — like flow-connector,
        // its inline SVG flows through the SVG-as-image branch.
        const SNAP_CLASSES = [
          'pengui-card',
          'pengui-decoration',
          'pengui-flow-step',
          'pengui-frame',
          // v4.22 — code_block snaps as a composite. The figure ships a
          // PNG-rasterized version of the formatted code (whitespace,
          // mono, language badge); native text overlays still emit on
          // top so the user can edit the code in the editable PPTX. The
          // overlay won't keep visible whitespace alignment — accepted
          // trade-off, the raster carries the visual.
          'pengui-code-block',
        ];
        function isInlineFormattingTag(tag: string, el: Element): boolean {
          const t = tag.toUpperCase();
          if (['STRONG', 'B', 'EM', 'I', 'CODE', 'S', 'U', 'SUP', 'SUB'].includes(t)) return true;
          if (t === 'SPAN' && (el.className?.toString() ?? '').includes('pengui-text-')) return true;
          if (t === 'A' && !(el as HTMLAnchorElement).style?.cssText) return true;
          return false;
        }
        function isTextLeafFor(el: Element): boolean {
          const childElems = Array.from(el.children);
          const directText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => (n.textContent ?? '').trim())
            .join('');
          const totalText = (el.textContent ?? '').trim();
          if (childElems.length === 0) return directText.length > 0;
          const allInline = childElems.every((c) =>
            isInlineFormattingTag(c.tagName, c),
          );
          return totalText.length > 0 && allInline;
        }
        function markSnapDescendants(root: Element): void {
          for (const desc of Array.from(root.querySelectorAll('*'))) {
            // Text leaves walk normally and emit as native text shapes
            // ABOVE the snapshot. The post-eval snapshot pass injects a
            // global `* { color: transparent }` rule before screenshotting
            // so painted text never lands inside the PNG (text is always
            // supplied by the editable overlay, never duplicated).
            if (isTextLeafFor(desc)) continue;
            // Don't suppress nested snapshot anchors — but this can't
            // happen in current IR (cards / flows / decorations don't
            // nest each other). Defensive guard only.
            if (SNAP_CLASSES.some((c) => desc.classList.contains(c))) continue;
            snapHandled.add(desc);
          }
        }
        // Marks descendants of a mixed-content text leaf so the walk loop
        // doesn't re-emit them as separate elements. Without this, a heading
        // like `<h1>The Art of <span class="pengui-text-accent-warm">Coffee</span></h1>`
        // would be split: the heading falls through (mixed content => not a
        // text leaf under the strict rule), the inner span is later picked
        // up as a text leaf on its own, and "The Art of " is dropped.
        const formattingHandled = new Set<Element>();
        // Tags the IR renderer (rich-text-renderer.ts) emits as inline
        // formatting around RichText runs. STRONG/B/EM/I/CODE/S/U/SUP/SUB are
        // always treated as inline; SPAN qualifies only when it carries a
        // pengui-text-* class (the IR color marker) so we don't collapse
        // styled badges; A qualifies only when it has no visual chrome.
        // Shared run-collector used by both the mixed-content text-leaf path
        // (hero/heading/prose/list-item) and the table-cell extractor.
        // Walks the element's child nodes recursively and produces SlideTextRun
        // objects that preserve color, bold, italic, underline, and link.
        type RunFmt = {
          color?: string;
          fontFamily?: string;
          fontSize?: number;
          bold?: boolean;
          italic?: boolean;
          underline?: boolean;
        };
        const collectRunsFor = (root: HTMLElement, baseFmt: RunFmt): SlideTextRun[] => {
          const walk = (node: Node, fmt: RunFmt, link?: string): SlideTextRun[] => {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = (node.textContent ?? '').replace(/\r\n/g, '\n');
              if (text.length === 0) return [];
              return [{
                text,
                color: fmt.color,
                fontFamily: fmt.fontFamily,
                fontSize: fmt.fontSize,
                ...(fmt.bold ? { bold: true } : {}),
                ...(fmt.italic ? { italic: true } : {}),
                ...(fmt.underline ? { underline: true } : {}),
                ...(link ? { link } : {}),
              }];
            }
            if (!(node instanceof HTMLElement)) return [];
            const cs = window.getComputedStyle(node);
            const tag = node.tagName.toUpperCase();
            const childFmt: RunFmt = {
              color: cs.color || fmt.color,
              fontFamily: trimFontFamily(cs.fontFamily) || fmt.fontFamily,
              fontSize: toNumber(cs.fontSize) ?? fmt.fontSize,
              bold: fmt.bold || (toNumber(cs.fontWeight) ?? 400) >= 600
                || tag === 'STRONG' || tag === 'B',
              italic: fmt.italic || cs.fontStyle === 'italic'
                || tag === 'EM' || tag === 'I',
              underline: fmt.underline || tag === 'U'
                || (cs.textDecorationLine?.includes('underline') ?? false),
            };
            const childLink = tag === 'A' ? (node.getAttribute('href') ?? link) : link;
            const out: SlideTextRun[] = [];
            for (const grand of Array.from(node.childNodes)) {
              out.push(...walk(grand, childFmt, childLink));
            }
            return out;
          };
          const out: SlideTextRun[] = [];
          for (const child of Array.from(root.childNodes)) {
            out.push(...walk(child, baseFmt));
          }
          return out;
        };

        const isInlineFormattingChild = (child: HTMLElement): boolean => {
          const tag = child.tagName.toUpperCase();
          if (
            tag === 'STRONG' || tag === 'B' || tag === 'EM' || tag === 'I'
            || tag === 'CODE' || tag === 'S' || tag === 'U' || tag === 'SUP' || tag === 'SUB'
          ) {
            return true;
          }
          if (tag === 'SPAN') {
            return Array.from(child.classList).some((cls) => cls.startsWith('pengui-text-'));
          }
          if (tag === 'A') {
            const cs = window.getComputedStyle(child);
            const hasBg = !!cs.backgroundColor
              && cs.backgroundColor !== 'transparent'
              && cs.backgroundColor !== 'rgba(0, 0, 0, 0)'
              && cs.backgroundColor !== 'rgba(0,0,0,0)';
            const hasBorder = (Number.parseFloat(cs.borderWidth) || 0) > 0;
            const hasShadow = !!cs.boxShadow && cs.boxShadow !== 'none';
            return !hasBg && !hasBorder && !hasShadow;
          }
          return false;
        };
        const selectorFor = (tagName: string, className: string): string => {
          const classes = String(className || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .join('.');
          return `${tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
        };
        const domPathFor = (element: HTMLElement): string => {
          const parts: string[] = [];
          let current: HTMLElement | null = element;

          while (current && current !== root) {
            const parent: HTMLElement | null = current.parentElement;
            if (!parent) {
              break;
            }
            const siblings = (Array.from(parent.children) as Element[])
              .filter((candidate) => candidate.tagName === current?.tagName);
            const index = Math.max(1, siblings.indexOf(current) + 1);
            parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${index})`);
            current = parent;
          }

          return parts.length > 0 ? `.slide > ${parts.join(' > ')}` : '.slide';
        };

        const normalizeDash = (value?: string): 'solid' | 'dashed' | 'dotted' | undefined => {
          switch (value) {
            case 'dashed':
              return 'dashed';
            case 'dotted':
              return 'dotted';
            default:
              return 'solid';
          }
        };

        const trimFontFamily = (value?: string): string | undefined => {
          if (!value) return undefined;
          return value.split(',').map((item) => item.trim()).filter(Boolean).join(', ');
        };

        const parsePseudoContent = (value: string): string | null => {
          if (!value || value === 'none' || value === 'normal' || value === '""' || value === "''") {
            return null;
          }

          const matches = [...value.matchAll(/"([^"]*)"|'([^']*)'/g)];
          if (matches.length === 0) {
            return null;
          }

          return matches
            .map((match) => match[1] ?? match[2] ?? '')
            .join('');
        };

        // Includes ✓ (U+2713) so checklist `::before` markers — emitted by
        // `pengui-list-checklist` — are stripped from text and rendered as a
        // PPTX bullet character instead of literal text.
        const isBulletLike = (value: string): boolean => /^[•◦▪▸▹▶▷‣·\-–—✓]+$/.test(value.trim());

        const nextRotation = (transform: string): number => {
          if (!transform || transform === 'none') {
            return 0;
          }
          if (transform.startsWith('matrix3d')) {
            return Number.NaN;
          }
          const match = transform.match(/matrix\(([^)]+)\)/);
          if (!match) {
            return Number.NaN;
          }
          const values = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
          if (values.length < 6 || values.some((value) => Number.isNaN(value))) {
            return Number.NaN;
          }
          const [a, b] = values;
          return Math.round(Math.atan2(b, a) * (180 / Math.PI) * 1000) / 1000;
        };

        const pushIssue = (issue: SlideTranslationIssue): void => {
          issues.push(issue);
        };
        const markBackground = (
          selector: string,
          code: string,
          message: string,
          detail?: string,
        ): { disposition: SlideExportDisposition; fallbackReason: string } => {
          pushIssue({
            code,
            severity: 'warning',
            selector,
            message,
            ...(detail ? { detail } : {}),
          });
          return {
            disposition: 'background',
            fallbackReason: code,
          };
        };

        const isVisible = (computed: CSSStyleDeclaration, rect: DOMRect): boolean => {
          if (computed.display === 'none' || computed.visibility === 'hidden') {
            return false;
          }
          const opacity = Number.parseFloat(computed.opacity || '1');
          if (opacity <= 0.01) {
            return false;
          }
          return rect.width > 0 && rect.height > 0;
        };

        const toNumber = (value: string): number | undefined => {
          const parsed = Number.parseFloat(value);
          return Number.isFinite(parsed) ? parsed : undefined;
        };

        const hasPseudoVisualStyle = (style: CSSStyleDeclaration): boolean => {
          const backgroundColor = style.backgroundColor;
          const borderWidth = toNumber(style.borderWidth) ?? 0;
          const hasVisibleBackgroundColor = Boolean(
            backgroundColor
            && backgroundColor !== 'transparent'
            && backgroundColor !== 'rgba(0, 0, 0, 0)'
            && backgroundColor !== 'rgba(0,0,0,0)',
          );

          return hasVisibleBackgroundColor
            || Boolean(style.backgroundImage && style.backgroundImage !== 'none')
            || Boolean(style.filter && style.filter !== 'none')
            || Boolean(style.boxShadow && style.boxShadow !== 'none')
            || borderWidth > 0
            || Boolean(style.mixBlendMode && style.mixBlendMode !== 'normal');
        };

        const inferStretch = (element: HTMLElement, computed: CSSStyleDeclaration): { stretchX: boolean; stretchY: boolean } => {
          const parent = element.parentElement;
          if (!parent) {
            return { stretchX: false, stretchY: false };
          }

          const parentComputed = window.getComputedStyle(parent);
          const display = parentComputed.display;
          if (!display.includes('flex')) {
            return { stretchX: false, stretchY: false };
          }

          const direction = parentComputed.flexDirection || 'row';
          const isColumn = direction.startsWith('column');
          const alignSelf = computed.alignSelf && computed.alignSelf !== 'auto'
            ? computed.alignSelf
            : parentComputed.alignItems;
          const crossStretch = alignSelf === 'stretch' || alignSelf === 'normal';
          const parentRect = parent.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();
          const parentInnerWidth = parentRect.width
            - (toNumber(parentComputed.paddingLeft) ?? 0)
            - (toNumber(parentComputed.paddingRight) ?? 0);
          const parentInnerHeight = parentRect.height
            - (toNumber(parentComputed.paddingTop) ?? 0)
            - (toNumber(parentComputed.paddingBottom) ?? 0);
          const widthNearParent = parentInnerWidth > 0 && elementRect.width >= (parentInnerWidth - 4);
          const heightNearParent = parentInnerHeight > 0 && elementRect.height >= (parentInnerHeight - 4);

          return {
            stretchX: isColumn ? crossStretch && widthNearParent : false,
            stretchY: !isColumn ? crossStretch && heightNearParent : false,
          };
        };

        const createBase = (
          element: HTMLElement,
          kind: SlideElement['kind'],
          computed: CSSStyleDeclaration,
          rect: DOMRect,
          index: number,
          options?: { allowTextualPseudo?: boolean },
        ) => {
          const selector = selectorFor(element.tagName, element.className);
          const domPath = domPathFor(element);
          const rotation = nextRotation(computed.transform);
          let exportDisposition: SlideExportDisposition = 'native';
          let fallbackReason: string | undefined;
          const setBackground = (code: string, message: string, detail?: string): void => {
            if (exportDisposition === 'background') {
              return;
            }
            const fallback = markBackground(selector, code, message, detail);
            exportDisposition = fallback.disposition;
            fallbackReason = fallback.fallbackReason;
          };

          if (Number.isNaN(rotation)) {
            setBackground(
              'unsupported-transform',
              'Complex transforms will be flattened into the slide background for export.',
              computed.transform,
            );
          }

          const backdropFilter = (computed as CSSStyleDeclaration & { backdropFilter?: string }).backdropFilter;
          if (computed.filter !== 'none' || (backdropFilter && backdropFilter !== 'none') || computed.mixBlendMode !== 'normal') {
            setBackground(
              'unsupported-effects',
              'CSS filters, backdrop filters, and blend modes will be flattened into the slide background.',
            );
          }

          const beforeStyle = window.getComputedStyle(element, '::before');
          const afterStyle = window.getComputedStyle(element, '::after');
          const beforeContent = beforeStyle.content;
          const afterContent = afterStyle.content;
          const beforeText = parsePseudoContent(beforeContent);
          const afterText = parsePseudoContent(afterContent);
          if (beforeText && !options?.allowTextualPseudo) {
            setBackground(
              'unsupported-pseudo-before',
              'Pseudo-element content (::before) will be flattened into the slide background.',
              beforeContent,
            );
          }
          if (afterText && !options?.allowTextualPseudo) {
            setBackground(
              'unsupported-pseudo-after',
              'Pseudo-element content (::after) will be flattened into the slide background.',
              afterContent,
            );
          }
          if (beforeContent && beforeContent !== 'none' && beforeContent !== 'normal' && !beforeText) {
            setBackground(
              'unsupported-pseudo-before',
              'Decorative pseudo-element content (::before) will be flattened into the slide background.',
              beforeContent,
            );
          }
          if (afterContent && afterContent !== 'none' && afterContent !== 'normal' && !afterText) {
            setBackground(
              'unsupported-pseudo-after',
              'Decorative pseudo-element content (::after) will be flattened into the slide background.',
              afterContent,
            );
          }
          if (hasPseudoVisualStyle(beforeStyle)) {
            setBackground(
              'unsupported-pseudo-before-visual',
              'Decorative pseudo-element visuals (::before) will be flattened into the slide background.',
            );
          }
          if (hasPseudoVisualStyle(afterStyle)) {
            setBackground(
              'unsupported-pseudo-after-visual',
              'Decorative pseudo-element visuals (::after) will be flattened into the slide background.',
            );
          }

          if (computed.backgroundImage && computed.backgroundImage !== 'none') {
            setBackground(
              'unsupported-background-image',
              'CSS background images and gradients will be flattened into the slide background.',
              computed.backgroundImage,
            );
          }

          if (computed.boxShadow && computed.boxShadow !== 'none') {
            setBackground(
              'unsupported-shadow',
              'Box shadows will be flattened into the slide background.',
              computed.boxShadow,
            );
          }

          return {
            id: element.getAttribute('data-edit-id') || element.getAttribute('data-document-id') || `el-${index}`,
            kind,
            x: Math.round((rect.left - rootRect.left) * 1000) / 1000,
            y: Math.round((rect.top - rootRect.top) * 1000) / 1000,
            width: Math.round(rect.width * 1000) / 1000,
            height: Math.round(rect.height * 1000) / 1000,
            rotation: Number.isNaN(rotation) ? 0 : rotation,
            zIndex: index,
            opacity: Number.parseFloat(computed.opacity || '1') || 1,
            locked: false,
            selector,
            domPath,
            exportDisposition,
            ...(fallbackReason ? { fallbackReason } : {}),
            style: {
              ...inferStretch(element, computed),
              backgroundColor: computed.backgroundImage && computed.backgroundImage !== 'none'
                ? undefined
                : computed.backgroundColor,
              backgroundImage: computed.backgroundImage && computed.backgroundImage !== 'none'
                ? computed.backgroundImage
                : undefined,
              backgroundSize: computed.backgroundSize,
              backgroundPosition: computed.backgroundPosition,
              backgroundRepeat: computed.backgroundRepeat,
              color: computed.color,
              borderColor: computed.borderColor,
              borderWidth: toNumber(computed.borderWidth),
              borderStyle: computed.borderStyle,
              borderRadius: toNumber(computed.borderTopLeftRadius),
              fontFamily: trimFontFamily(computed.fontFamily),
              fontSize: toNumber(computed.fontSize),
              fontWeight: toNumber(computed.fontWeight),
              fontStyle: computed.fontStyle,
              lineHeight: toNumber(computed.lineHeight),
              letterSpacing: toNumber(computed.letterSpacing),
              textAlign: computed.textAlign as 'left' | 'center' | 'right' | 'justify',
              display: computed.display,
              justifyContent: computed.justifyContent,
              alignItems: computed.alignItems,
              alignSelf: computed.alignSelf,
              whiteSpace: computed.whiteSpace,
              paddingTop: toNumber(computed.paddingTop),
              paddingRight: toNumber(computed.paddingRight),
              paddingBottom: toNumber(computed.paddingBottom),
              paddingLeft: toNumber(computed.paddingLeft),
              objectFit: computed.objectFit,
              opacity: Number.parseFloat(computed.opacity || '1') || 1,
              boxShadow: computed.boxShadow && computed.boxShadow !== 'none'
                ? computed.boxShadow
                : undefined,
              filter: computed.filter && computed.filter !== 'none'
                ? computed.filter
                : undefined,
              backdropFilter: backdropFilter && backdropFilter !== 'none'
                ? backdropFilter
                : undefined,
              mixBlendMode: computed.mixBlendMode && computed.mixBlendMode !== 'normal'
                ? computed.mixBlendMode
                : undefined,
              fill: computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)'
                ? { color: computed.backgroundColor }
                : undefined,
              line: toNumber(computed.borderWidth)
                ? {
                    color: computed.borderColor,
                    width: toNumber(computed.borderWidth),
                    dash: normalizeDash(computed.borderStyle),
                  }
                : undefined,
              shadow: computed.boxShadow && computed.boxShadow !== 'none'
                ? { color: computed.boxShadow }
                : undefined,
            },
          };
        };

        const rootBeforeStyle = window.getComputedStyle(root, '::before');
        const rootAfterStyle = window.getComputedStyle(root, '::after');
        if (hasPseudoVisualStyle(rootBeforeStyle)) {
          pushIssue({
            code: 'unsupported-root-pseudo-before-visual',
            severity: 'warning',
            selector: '.slide',
            message: 'Decorative root pseudo-element visuals (::before) will be flattened into the slide background.',
          });
          elements.push({
            id: 'root-pseudo-before',
            kind: 'shape',
            x: 0,
            y: 0,
            width: Math.round(rootRect.width * 1000) / 1000,
            height: Math.round(rootRect.height * 1000) / 1000,
            rotation: 0,
            zIndex: -2,
            opacity: 1,
            locked: false,
            selector: '.slide',
            domPath: '.slide',
            exportDisposition: 'background',
            fallbackReason: 'unsupported-root-pseudo-before-visual',
            shapeType: 'rectangle',
            style: {},
          });
        }
        if (hasPseudoVisualStyle(rootAfterStyle)) {
          pushIssue({
            code: 'unsupported-root-pseudo-after-visual',
            severity: 'warning',
            selector: '.slide',
            message: 'Decorative root pseudo-element visuals (::after) will be flattened into the slide background.',
          });
          elements.push({
            id: 'root-pseudo-after',
            kind: 'shape',
            x: 0,
            y: 0,
            width: Math.round(rootRect.width * 1000) / 1000,
            height: Math.round(rootRect.height * 1000) / 1000,
            rotation: 0,
            zIndex: -1,
            opacity: 1,
            locked: false,
            selector: '.slide',
            domPath: '.slide',
            exportDisposition: 'background',
            fallbackReason: 'unsupported-root-pseudo-after-visual',
            shapeType: 'rectangle',
            style: {},
          });
        }

        const all = Array.from(root.querySelectorAll<HTMLElement>('*'));
        all.forEach((element, index) => {
          const tagName = element.tagName.toUpperCase();
          const selector = selectorFor(tagName, element.className);
          if (tagName === 'VIDEO' || tagName === 'CANVAS' || tagName === 'IFRAME') {
            pushIssue({
              code: 'unsupported-element',
              severity: 'error',
              selector,
              message: `Element ${tagName.toLowerCase()} is not supported for editable export.`,
            });
            return;
          }

          if (tableHandled.has(element)) {
            return;
          }

          if (formattingHandled.has(element)) {
            return;
          }

          if (chartHandled.has(element)) {
            return;
          }

          if (snapHandled.has(element)) {
            return;
          }

          const computed = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (!isVisible(computed, rect)) {
            return;
          }

          // v4.18.1 — composite visual snapshot. When the walker hits
          // one of the SNAP_CLASSES anchors, emit a single PNG-snapshot
          // placeholder (resolved post-eval) and suppress the structural
          // walker for non-text descendants. Text leaves still flow so
          // they emit as editable native text on top of the snapshot.
          //
          // Skip elements with zero area (decorations sometimes start
          // out collapsed under hidden parents). Also skip chrome
          // headers/footers since their slot contents (logos, page
          // numbers) already render as native shapes — snapshotting
          // would lose editability of the page-number text.
          if (
            rect.width > 0
            && rect.height > 0
            && SNAP_CLASSES.some((c) => element.classList.contains(c))
          ) {
            const snapId = `snap-${snapCounter++}`;
            element.setAttribute('data-snap-id', snapId);
            // Mark the candidate itself + structural descendants. Text
            // descendants (text leaves) are NOT marked so they walk
            // naturally and emit as text shapes above the snapshot.
            snapHandled.add(element);
            markSnapDescendants(element);
            const decoAncestor = element.classList.contains('pengui-decoration')
              ? element
              : null;
            const decoZ = decoAncestor?.classList.contains('pengui-decoration-background')
              ? -50
              : decoAncestor?.classList.contains('pengui-decoration-foreground')
                ? 10000
                : index;
            elements.push({
              id: `el-${index}-snap`,
              kind: 'image',
              x: Math.round((rect.left - rootRect.left) * 1000) / 1000,
              y: Math.round((rect.top - rootRect.top) * 1000) / 1000,
              width: Math.round(rect.width * 1000) / 1000,
              height: Math.round(rect.height * 1000) / 1000,
              rotation: 0,
              zIndex: decoZ,
              opacity: toNumber(computed.opacity) ?? 1,
              locked: false,
              selector,
              domPath: domPathFor(element),
              style: {},
              src: `pengui-snap://${snapId}`,
              alt: '',
            });
            // Fall through so text descendants (eyebrow, heading, body,
            // label, badge) iterate naturally and emit as text.
            return;
          }

          // v4.12 chart figure — pre-v4.14.6 this entire chart was
          // marked exportDisposition:'background', which made the
          // editable-export planner flip the WHOLE slide to
          // hybrid_background mode. That killed parity with the static
          // PPTX for any chart-bearing slide: cards / chrome / icons
          // all collapsed into the slide-wide background image and the
          // user lost the v4.13/v4.14/v4.14.5 native-shape work the
          // moment they added a chart.
          //
          // v4.14.6: extract the chart's resolved ECharts SVG (already
          // produced by resolveChartRefs upstream) and emit it as a
          // native image at the SVG's actual bounding rect, exactly
          // like a v4.14.5 inline icon. Other slide elements stay
          // native — no whole-slide background fallback. The chart
          // figure walker emits nothing else; figcaption (sibling of
          // SVG inside the figure) walks normally and becomes a text
          // shape.
          if (element.classList?.contains('pengui-chart')) {
            // Mark the chart figure itself as handled — defensive against
            // future walker re-entries. The current depth-first walk
            // never re-visits, but explicit marking removes the implicit
            // ordering dependency.
            chartHandled.add(element);
            const svgEl = element.querySelector('svg');
            if (svgEl) {
              chartHandled.add(svgEl);
              for (const desc of Array.from(svgEl.querySelectorAll('*'))) {
                chartHandled.add(desc);
              }
              const svgRect = svgEl.getBoundingClientRect();
              const svgString = new XMLSerializer().serializeToString(svgEl);
              const b64 = btoa(unescape(encodeURIComponent(svgString)));
              elements.push({
                id: `el-${index}-chart`,
                kind: 'image',
                x: Math.round((svgRect.left - rootRect.left) * 1000) / 1000,
                y: Math.round((svgRect.top - rootRect.top) * 1000) / 1000,
                width: Math.round(svgRect.width * 1000) / 1000,
                height: Math.round(svgRect.height * 1000) / 1000,
                rotation: 0,
                zIndex: index,
                opacity: 1,
                locked: false,
                selector,
                domPath: domPathFor(element),
                style: {},
                src: `data:image/svg+xml;base64,${b64}`,
                alt: 'Chart',
              });
              // Do NOT return — let the figcaption (figure's text
              // sibling, not in chartHandled) walk and emit naturally.
            } else {
              // Pre-resolve fallback — if the chart placeholder is
              // still in place, we have no SVG to extract. Keep the
              // legacy whole-slide-background behaviour rather than
              // emit a broken chart slide.
              for (const desc of Array.from(element.querySelectorAll('*'))) {
                chartHandled.add(desc);
              }
              const base = createBase(element, 'image', computed, rect, index) as Omit<SlideImageElement, 'src' | 'alt'>;
              elements.push({
                ...base,
                kind: 'image',
                src: 'pengui-chart://background',
                alt: 'Chart',
                exportDisposition: 'background' as const,
                fallbackReason: 'non-fetchable-image',
              });
              pushIssue({
                code: 'non-fetchable-image',
                severity: 'warning',
                selector,
                message:
                  'Chart placeholder not resolved before editable export — falling back to slide background. Run resolveChartRefs first.',
              });
            }
            // Skip the rest of the handler for this iteration — the
            // figure itself doesn't need a generic shape, and its
            // children (SVG + descendants) are filtered via
            // chartHandled. Subsequent iterations of the walker still
            // emit figcaption naturally.
            return;
          }

          // <hr> renders as a 1-2px horizontal rule via border-top. The
          // generic shape branch would emit it as a 'rectangle' (or
          // roundRectangle if it has a radius) which PowerPoint draws as a
          // filled box — visually wrong. Use the native PPTX line shape.
          if (tagName === 'HR') {
            const base = createBase(element, 'shape', computed, rect, index) as Omit<SlideShapeElement, 'shapeType'>;
            elements.push({
              ...base,
              kind: 'shape',
              shapeType: 'line',
            });
            return;
          }

          if (tagName === 'TABLE') {
            // Mark every descendant — not just cells. Without this, an inline
            // run inside a cell (e.g. `<span class="pengui-text-accent">`)
            // gets walked separately as a text leaf and emits a duplicate
            // floating text element on top of the table cell.
            for (const desc of Array.from(element.querySelectorAll('*'))) {
              tableHandled.add(desc);
            }
            const rows = Array.from(element.querySelectorAll('tr'));
            const cells: SlideTableCell[] = [];

            rows.forEach((row, rowIndex) => {
              Array.from(row.children).forEach((cellEl, columnIndex) => {
                if (!(cellEl instanceof HTMLElement)) return;
                tableHandled.add(cellEl);
                const cellStyle = window.getComputedStyle(cellEl);
                const cellBaseFmt: RunFmt = {
                  color: cellStyle.color,
                  fontFamily: trimFontFamily(cellStyle.fontFamily),
                  fontSize: toNumber(cellStyle.fontSize),
                  bold: (toNumber(cellStyle.fontWeight) ?? 400) >= 600,
                  italic: cellStyle.fontStyle === 'italic',
                };
                const cellRuns = collectRunsFor(cellEl, cellBaseFmt);
                cells.push({
                  row: rowIndex,
                  column: columnIndex,
                  text: cellEl.innerText.trim(),
                  ...(cellRuns.length > 0 ? { runs: cellRuns } : {}),
                  style: {
                    backgroundColor: cellStyle.backgroundColor,
                    color: cellStyle.color,
                    borderColor: cellStyle.borderColor,
                    borderWidth: toNumber(cellStyle.borderWidth),
                    borderStyle: cellStyle.borderStyle,
                    fontFamily: trimFontFamily(cellStyle.fontFamily),
                    fontSize: toNumber(cellStyle.fontSize),
                    fontWeight: toNumber(cellStyle.fontWeight),
                    textAlign: cellStyle.textAlign as 'left' | 'center' | 'right' | 'justify',
                  },
                });
              });
            });

            // The `<table>` bounding rect INCLUDES its `<caption>` because
            // caption is a child element. If we leave it as-is, the exporter
            // emits the table at the caption's top edge AND emits the
            // caption text on top of the same y → overlap. Shrink the
            // table's bbox to the inner row area before constructing base.
            const captionElForBbox = element.querySelector(':scope > caption');
            const tbody = element.querySelector(':scope > tbody');
            const thead = element.querySelector(':scope > thead');
            const innerStart = thead instanceof HTMLElement
              ? thead.getBoundingClientRect().top
              : tbody instanceof HTMLElement
                ? tbody.getBoundingClientRect().top
                : rect.top;
            const tableInnerRect = (captionElForBbox instanceof HTMLElement) && innerStart > rect.top
              ? new DOMRect(rect.left, innerStart, rect.width, rect.bottom - innerStart)
              : rect;

            const base = createBase(element, 'table', computed, tableInnerRect, index) as Omit<SlideTableElement, 'rows' | 'columns' | 'cells'>;
            elements.push({
              ...base,
              kind: 'table',
              rows: rows.length,
              columns: rows[0] ? rows[0].children.length : 0,
              cells,
            });

            // Emit `<caption>` (if any) as its own native text element so the
            // exporter renders it as a separate text shape above/below the
            // table — pptxgenjs has no native table caption.
            const captionEl = element.querySelector(':scope > caption');
            if (captionEl instanceof HTMLElement) {
              const capStyle = window.getComputedStyle(captionEl);
              const capRect = captionEl.getBoundingClientRect();
              if (isVisible(capStyle, capRect)) {
                const capBaseFmt: RunFmt = {
                  color: capStyle.color,
                  fontFamily: trimFontFamily(capStyle.fontFamily),
                  fontSize: toNumber(capStyle.fontSize),
                  bold: (toNumber(capStyle.fontWeight) ?? 400) >= 600,
                  italic: capStyle.fontStyle === 'italic',
                };
                const capRuns = collectRunsFor(captionEl, capBaseFmt);
                const capText = (captionEl.textContent ?? '').replace(/\r\n/g, '\n');
                const capBase = createBase(captionEl, 'text', capStyle, capRect, index + 0.5) as Omit<SlideTextElement, 'text' | 'paragraphs' | 'editId'>;
                elements.push({
                  ...capBase,
                  kind: 'text',
                  text: capText,
                  paragraphs: [{
                    text: capText,
                    runs: capRuns.length > 0 ? capRuns : [{
                      text: capText,
                      color: capBaseFmt.color,
                      fontFamily: capBaseFmt.fontFamily,
                      fontSize: capBaseFmt.fontSize,
                      ...(capBaseFmt.bold ? { bold: true } : {}),
                      ...(capBaseFmt.italic ? { italic: true } : {}),
                    }],
                  }],
                  editId: captionEl.getAttribute('data-edit-id') || undefined,
                });
              }
            }
            return;
          }

          const directText = Array.from(element.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent ?? '')
            .join('')
            .trim();
          const childElementsRaw = Array.from(element.children).filter(
            (child): child is HTMLElement => child instanceof HTMLElement,
          );
          const hasElementChildren = childElementsRaw.length > 0;
          const allChildrenAreInlineFormatting = hasElementChildren
            && childElementsRaw.every((child) => isInlineFormattingChild(child));
          // A text leaf is either:
          //   - the strict case: only direct text, no element children
          //   - the mixed-content case: any text content + only inline-formatting
          //     children (the IR renderer's RichText output, e.g.
          //     `<h1>The Art of <span class="pengui-text-accent-warm">Coffee</span></h1>`)
          const totalText = (element.textContent ?? '').trim();
          const isTextLeaf = (directText.length > 0 && !hasElementChildren)
            || (totalText.length > 0 && allChildrenAreInlineFormatting);

          if (isTextLeaf) {
            const beforeText = parsePseudoContent(window.getComputedStyle(element, '::before').content) ?? '';
            const afterText = parsePseudoContent(window.getComputedStyle(element, '::after').content) ?? '';
            const isListItem = tagName === 'LI';
            const bulletText = isListItem && isBulletLike(beforeText) ? beforeText.trim() : '';
            // Numbered when the LI's parent is an <ol>. PPTX paragraph
            // bullets accept type='bullet' or 'number' — without this the
            // exporter falls back to bullet glyphs even on `<ol>` items.
            const listParent = isListItem ? element.parentElement : null;
            const listKind: 'bullet' | 'number' = listParent && listParent.tagName.toUpperCase() === 'OL'
              ? 'number'
              : 'bullet';

            // Mark every descendant element as handled — we're collapsing
            // them all into runs of this text element. Without this,
            // descendant <span class="pengui-text-*"> would later be picked
            // up as their own text leaves and rendered on top.
            for (const desc of Array.from(element.querySelectorAll('*'))) {
              formattingHandled.add(desc);
            }

            type RunFmt = {
              color?: string;
              fontFamily?: string;
              fontSize?: number;
              bold?: boolean;
              italic?: boolean;
              underline?: boolean;
            };

            const baseFmt: RunFmt = {
              color: computed.color,
              fontFamily: trimFontFamily(computed.fontFamily),
              fontSize: toNumber(computed.fontSize),
              bold: (toNumber(computed.fontWeight) ?? 400) >= 600,
              italic: computed.fontStyle === 'italic',
            };

            const collectRuns = (node: Node, fmt: RunFmt, link?: string): SlideTextRun[] => {
              if (node.nodeType === Node.TEXT_NODE) {
                const text = (node.textContent ?? '').replace(/\r\n/g, '\n');
                if (text.length === 0) return [];
                return [{
                  text,
                  color: fmt.color,
                  fontFamily: fmt.fontFamily,
                  fontSize: fmt.fontSize,
                  ...(fmt.bold ? { bold: true } : {}),
                  ...(fmt.italic ? { italic: true } : {}),
                  ...(fmt.underline ? { underline: true } : {}),
                  ...(link ? { link } : {}),
                }];
              }
              if (!(node instanceof HTMLElement)) return [];
              const childComputed = window.getComputedStyle(node);
              const childTag = node.tagName.toUpperCase();
              const childFmt: RunFmt = {
                color: childComputed.color || fmt.color,
                fontFamily: trimFontFamily(childComputed.fontFamily) || fmt.fontFamily,
                fontSize: toNumber(childComputed.fontSize) ?? fmt.fontSize,
                bold: fmt.bold || (toNumber(childComputed.fontWeight) ?? 400) >= 600
                  || childTag === 'STRONG' || childTag === 'B',
                italic: fmt.italic || childComputed.fontStyle === 'italic'
                  || childTag === 'EM' || childTag === 'I',
                underline: fmt.underline || childTag === 'U'
                  || (childComputed.textDecorationLine?.includes('underline') ?? false),
              };
              // Capture href when the inline element is an anchor. Inner
              // <a><strong>…</strong></a> propagates the link down to the
              // text-node base case via the `link` parameter.
              const childLink = childTag === 'A'
                ? (node.getAttribute('href') ?? link)
                : link;
              const out: SlideTextRun[] = [];
              for (const grand of Array.from(node.childNodes)) {
                out.push(...collectRuns(grand, childFmt, childLink));
              }
              return out;
            };

            const innerRuns: SlideTextRun[] = [];
            if (!hasElementChildren) {
              // Strict text leaf: preserve old innerText behavior so we keep
              // any whitespace-collapsing CSS picks up.
              innerRuns.push({
                text: element.innerText.replace(/\r\n/g, '\n'),
                color: baseFmt.color,
                fontFamily: baseFmt.fontFamily,
                fontSize: baseFmt.fontSize,
                ...(baseFmt.bold ? { bold: true } : {}),
                ...(baseFmt.italic ? { italic: true } : {}),
              });
            } else {
              for (const child of Array.from(element.childNodes)) {
                innerRuns.push(...collectRuns(child, baseFmt));
              }
            }

            const allRuns: SlideTextRun[] = [];
            if (!bulletText && beforeText) {
              allRuns.push({
                text: beforeText,
                color: baseFmt.color,
                fontFamily: baseFmt.fontFamily,
                fontSize: baseFmt.fontSize,
              });
            }
            allRuns.push(...innerRuns);
            if (afterText) {
              allRuns.push({
                text: afterText,
                color: baseFmt.color,
                fontFamily: baseFmt.fontFamily,
                fontSize: baseFmt.fontSize,
              });
            }

            const combinedText = allRuns.map((r) => r.text).join('');
            const base = createBase(element, 'text', computed, rect, index, {
              allowTextualPseudo: true,
            }) as Omit<SlideTextElement, 'text' | 'paragraphs' | 'editId'>;

            // v4.18.2 — properly split runs across newline boundaries so
            // multi-run formatting (color, bold, italic) survives within
            // each paragraph. Pre-v4.18.2 the splitter degraded to one
            // paragraph per line carrying ONLY the base format, which
            // dropped accent colors on any heading authored as
            // `'Title,\nthat ', { text: 'wraps', color: 'accent' }, '.'`.
            const splitRunsByNewline = (runs: SlideTextRun[]): SlideTextRun[][] => {
              const lines: SlideTextRun[][] = [[]];
              for (const r of runs) {
                if (!r.text.includes('\n')) {
                  lines[lines.length - 1].push(r);
                  continue;
                }
                const parts = r.text.split('\n');
                parts.forEach((part, i) => {
                  if (part.length > 0) {
                    lines[lines.length - 1].push({ ...r, text: part });
                  }
                  if (i < parts.length - 1) {
                    lines.push([]);
                  }
                });
              }
              return lines;
            };
            const hasNewlines = combinedText.includes('\n');
            const paragraphs = hasNewlines
              ? splitRunsByNewline(allRuns).map((lineRuns) => {
                  const lineText = lineRuns.map((r) => r.text).join('');
                  return {
                    text: lineText,
                    runs: lineRuns.length > 0
                      ? lineRuns
                      : [{
                          text: '',
                          color: baseFmt.color,
                          fontFamily: baseFmt.fontFamily,
                          fontSize: baseFmt.fontSize,
                          ...(baseFmt.bold ? { bold: true } : {}),
                          ...(baseFmt.italic ? { italic: true } : {}),
                        }],
                    ...(isListItem
                      ? {
                          bullet: {
                            type: listKind,
                            ...(bulletText ? { characterCode: bulletText.codePointAt(0)?.toString(16).toUpperCase() } : {}),
                            level: 0,
                          },
                        }
                      : {}),
                  };
                })
              : [{
                  text: combinedText,
                  runs: allRuns,
                  ...(isListItem
                    ? {
                        bullet: {
                          type: listKind,
                          ...(bulletText ? { characterCode: bulletText.codePointAt(0)?.toString(16).toUpperCase() } : {}),
                          level: 0,
                        },
                      }
                    : {}),
                }];

            elements.push({
              ...base,
              kind: 'text',
              text: combinedText,
              paragraphs,
              editId: element.getAttribute('data-edit-id') || undefined,
            });
            return;
          }

          // v4.14.5: inline <svg> elements (lucide card icons, future
          // ornaments) — serialize the SVG and emit as a native image with
          // a data: URI so they survive into the editable PPTX as <p:pic>
          // shapes. Without this, icons fell into the generic shape /
          // hasVisualShape branch and produced a floating empty rect, while
          // the visible icon lived only in the background image.
          //
          // Mark every descendant as "handled" (reusing chartHandled)
          // so the walker doesn't emit one floating shape per inner
          // <path> / <rect> / <text> on top of the icon image.
          if (tagName === 'SVG') {
            for (const desc of Array.from(element.querySelectorAll('*'))) {
              chartHandled.add(desc);
            }
            const svgString = new XMLSerializer().serializeToString(element);
            // Standard SVG → base64 idiom (handles unicode in attributes
            // / text). Page context, so btoa exists.
            const b64 = btoa(unescape(encodeURIComponent(svgString)));
            const src = `data:image/svg+xml;base64,${b64}`;
            const base = createBase(element, 'image', computed, rect, index) as Omit<SlideImageElement, 'src' | 'alt'>;
            // v4.16: SVG inside a decoration node — override zIndex so
            // background-layer decorations render behind body, foreground
            // above, regardless of IR ordering. Walk-order zIndex is the
            // wrong default for explicitly-layered decorations.
            const decoAncestor = element.closest('.pengui-decoration');
            const decoZ = decoAncestor?.classList.contains('pengui-decoration-background')
              ? -50
              : decoAncestor?.classList.contains('pengui-decoration-foreground')
                ? 10000
                : undefined;
            elements.push({
              ...base,
              ...(decoZ !== undefined ? { zIndex: decoZ } : {}),
              kind: 'image',
              src,
              // Decorative — icons carry semantic meaning via their
              // adjacent text (eyebrow / heading), not the SVG itself.
              alt: '',
            });
            return;
          }

          if (tagName === 'IMG') {
            const image = element as HTMLImageElement;
            const base = createBase(element, 'image', computed, rect, index) as Omit<SlideImageElement, 'src' | 'alt'>;
            const src = image.currentSrc || image.src;
            // v4.14.5: data: URIs are fetchable (the editable-pptx-exporter's
            // resolveImageData passes them through unchanged). Pre-v4.14.5
            // they were forced into the background fallback, which is what
            // made chrome logos disappear from the editable PPTX. Now they
            // flow through as native <p:pic> shapes.
            const isFetchable = /^https?:\/\//i.test(src) || /^data:/i.test(src);
            // v4.16: <img> inside a decoration node — same zIndex override
            // pattern as the inline-SVG branch above.
            const decoAncestor = element.closest('.pengui-decoration');
            const decoZ = decoAncestor?.classList.contains('pengui-decoration-background')
              ? -50
              : decoAncestor?.classList.contains('pengui-decoration-foreground')
                ? 10000
                : undefined;
            elements.push({
              ...base,
              ...(decoZ !== undefined ? { zIndex: decoZ } : {}),
              kind: 'image',
              src,
              alt: image.alt || undefined,
              ...(!isFetchable
                ? {
                    exportDisposition: 'background' as const,
                    fallbackReason: 'non-fetchable-image',
                  }
                : {}),
            });
            if (!isFetchable) {
              pushIssue({
                code: 'non-fetchable-image',
                severity: 'warning',
                selector,
                message: 'Images without fetchable HTTP(S) or data: URIs will be flattened into the slide background.',
                detail: src.slice(0, 128),
              });
            }
            return;
          }

          const hasVisualShape = (
            (computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)')
            || (computed.borderWidth && computed.borderWidth !== '0px')
            || (computed.boxShadow && computed.boxShadow !== 'none')
            || hasPseudoVisualStyle(window.getComputedStyle(element, '::before'))
            || hasPseudoVisualStyle(window.getComputedStyle(element, '::after'))
          );

          if (hasVisualShape) {
            const base = createBase(element, 'shape', computed, rect, index) as Omit<SlideShapeElement, 'shapeType'>;
            elements.push({
              ...base,
              kind: 'shape',
              shapeType: (toNumber(computed.borderTopLeftRadius) ?? 0) > 0 ? 'roundRectangle' : 'rectangle',
            });

            // v4.14.5: pengui-card accent top-border. The compiler's
            // generic shape branch records `borderColor` as a single
            // value (the shorthand collapses to one side), so the v4.13
            // accent — `border-top: 3px solid var(--color-accent-X)` on
            // top of a 1px neutral border — gets lost. Detect the card
            // class explicitly, compare top vs side colors, and emit a
            // dedicated accent rect on top of the card if they differ.
            //
            // The accent rect sits just inside the card's rounded
            // corners (inset by border-radius) so it doesn't poke past
            // the rounded outline. Sized to the actual border-top-width
            // (typically 3px in the v4.13 CSS).
            if (element.classList?.contains('pengui-card')) {
              const borderTopColor = computed.borderTopColor;
              const sideColor = computed.borderLeftColor;
              const borderTopWidth = toNumber(computed.borderTopWidth) ?? 0;
              const borderRadius = toNumber(computed.borderTopLeftRadius) ?? 0;
              const colorsDiffer = Boolean(
                borderTopColor
                && borderTopColor !== sideColor
                && borderTopColor !== 'rgba(0, 0, 0, 0)'
                && borderTopColor !== 'rgba(0,0,0,0)',
              );
              if (colorsDiffer && borderTopWidth >= 2) {
                const inset = Math.min(borderRadius, rect.width / 4);
                elements.push({
                  id: `${base.id}_accent_border`,
                  kind: 'shape',
                  x: Math.round((rect.left - rootRect.left + inset) * 1000) / 1000,
                  y: Math.round((rect.top - rootRect.top) * 1000) / 1000,
                  width: Math.round((rect.width - 2 * inset) * 1000) / 1000,
                  height: Math.max(2, borderTopWidth),
                  rotation: 0,
                  zIndex: index + 0.5,
                  opacity: 1,
                  locked: false,
                  selector,
                  domPath: base.domPath,
                  shapeType: 'rectangle',
                  style: {
                    backgroundColor: borderTopColor,
                    fill: { color: borderTopColor },
                    borderWidth: 0,
                    borderColor: undefined,
                    borderRadius: 0,
                  },
                });
              }
            }
          }
        });

        return {
          width: Math.round(rootRect.width),
          height: Math.round(rootRect.height),
          backgroundColor: rootBackground,
          backgroundImage: rootStyle.backgroundImage && rootStyle.backgroundImage !== 'none'
            ? rootStyle.backgroundImage
            : undefined,
          backgroundSize: rootStyle.backgroundSize,
          backgroundPosition: rootStyle.backgroundPosition,
          backgroundRepeat: rootStyle.backgroundRepeat,
          elements,
          issues,
        };
      });

      // v4.18.1 — resolve `pengui-snap://{id}` placeholders into real
      // PNG data URIs by screenshotting each tagged element. Runs after
      // page.evaluate so we can use Playwright's locator.screenshot()
      // (no DOM API equivalent inside the page). Before snapshotting,
      // inject CSS that hides text inside snap candidates — those text
      // leaves emit as editable native text overlays, so painting them
      // INTO the snapshot too would double-render the words slightly
      // off-center (unreadable mess).
      const snapElements = payload.elements.filter(
        (el): el is Extract<typeof el, { kind: 'image' }> =>
          el.kind === 'image' && el.src.startsWith('pengui-snap://'),
      );
      if (snapElements.length > 0) {
        // Playwright's locator.screenshot() takes a full-page screenshot
        // and crops to the bbox — so any text PAINTED on top of (or
        // visually overlapping) a snap candidate would be baked into the
        // PNG. To make snapshots strictly the chrome / visual layer with
        // text supplied separately by native overlays, hide ALL text on
        // the page for the duration of the snapshot pass.
        //
        // Critical: use `-webkit-text-fill-color: transparent` (NOT
        // `color: transparent`) so SVG `currentColor` references stay
        // intact. Lucide card icons + decoration ornaments (glow_ring,
        // corner_bracket, etc.) all paint with stroke="currentColor",
        // and `color: transparent` cascades to those — turning every
        // icon and decoration ring invisible in the snapshot.
        // `-webkit-text-fill-color` only affects text glyph rendering;
        // SVG fill/stroke use the `fill`/`stroke` properties and aren't
        // touched. `text-shadow: none` suppresses glow effects on text.
        await page.addStyleTag({
          content:
            '* { -webkit-text-fill-color: transparent !important; '
            + 'text-shadow: none !important; '
            + 'caret-color: transparent !important; }',
        });
      }
      // v4.20 — note on nested snap candidates: when a card_section
      // contains inner cards (BRONZE/SILVER/GOLD inside a lakehouse
      // section), each candidate produces its own snapshot. The outer
      // snap captures the full chrome including the inner cards baked
      // in; the inner snaps overlay perfectly on top because their
      // bboxes match. Result is acceptable — no visible artifact —
      // but file size grows since the same chrome is emitted twice.
      // Optimization deferred: hide nested snaps via per-screenshot
      // CSS toggle if it becomes a problem.
      for (const el of snapElements) {
        const snapId = el.src.slice('pengui-snap://'.length);
        try {
          const buf = await page
            .locator(`[data-snap-id="${snapId}"]`)
            .screenshot({ type: 'png', omitBackground: true });
          el.src = `data:image/png;base64,${buf.toString('base64')}`;
        } catch (err) {
          this.logger.warn('Snapshot failed for composite-visual node', {
            snapId,
            selector: el.selector,
            error: err instanceof Error ? err.message : String(err),
          });
          // Drop the placeholder so the exporter doesn't try to fetch a
          // pengui-snap:// URL it can't resolve.
          el.src = '';
          el.exportDisposition = 'background';
          el.fallbackReason = 'snapshot-failed';
        }
      }

      return payload;
    } finally {
      await browser.close();
    }
  }
}
