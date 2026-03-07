import * as cheerio from 'cheerio';
import type { Element as DomElement } from 'domhandler';
import {
  SlideTextEditInvalidError,
  SlideTextEditNotFoundError,
} from '../../types/errors.js';

interface EditableNormalizationResult {
  html: string;
  changed: boolean;
}

interface ApplyTextEditResult {
  html: string;
  changed: boolean;
}

const EDITABLE_ID_ATTR = 'data-edit-id';
const SKIP_TAGS = new Set(['html', 'head', 'body', 'style', 'script', 'meta', 'link', 'title']);

export class TextEditableNormalizer {
  normalize(html: string): EditableNormalizationResult {
    const $ = cheerio.load(html);
    const slideRoot = $('.slide').first();

    if (slideRoot.length === 0) {
      return { html, changed: false };
    }

    const usedIds = new Set<string>();
    slideRoot.find(`[${EDITABLE_ID_ATTR}]`).each((_, element) => {
      const id = $(element).attr(EDITABLE_ID_ATTR);
      if (id) {
        usedIds.add(id);
      }
    });

    let counter = 1;
    let changed = false;

    slideRoot.find('*').each((_, element) => {
      if (!this.isEligibleElement($, element)) {
        return;
      }

      const node = $(element);
      if (!node.attr(EDITABLE_ID_ATTR)) {
        const editId = this.nextId(usedIds, counter);
        counter = parseInt(editId.replace('text-', ''), 10) + 1;
        node.attr(EDITABLE_ID_ATTR, editId);
        changed = true;
      }
    });

    return {
      html: changed ? $.root().html() ?? html : html,
      changed,
    };
  }

  applyTextEdit(html: string, editId: string, text: string): ApplyTextEditResult {
    const $ = cheerio.load(html);
    const target = $(`[${EDITABLE_ID_ATTR}="${this.escapeAttributeValue(editId)}"]`).first();

    if (target.length === 0) {
      throw new SlideTextEditNotFoundError(editId);
    }

    if (!this.isEligibleElement($, target.get(0))) {
      throw new SlideTextEditInvalidError(
        editId,
        `Element "${editId}" is not editable because it contains nested elements or unsupported content.`,
      );
    }

    const nextText = text.replace(/\r\n/g, '\n');
    const previousText = target.text();
    if (previousText === nextText) {
      return { html, changed: false };
    }

    target.text(nextText);

    return {
      html: $.root().html() ?? html,
      changed: true,
    };
  }

  private isEligibleElement($: cheerio.CheerioAPI, element?: DomElement | null): boolean {
    if (!element || element.type !== 'tag') {
      return false;
    }

    if (SKIP_TAGS.has(element.tagName)) {
      return false;
    }

    const node = $(element);
    if (node.hasClass('slide')) {
      return false;
    }

    const contents = node.contents().toArray();
    if (contents.length === 0) {
      return false;
    }

    const hasTagChildren = contents.some((child) => child.type === 'tag');
    if (hasTagChildren) {
      return false;
    }

    const hasNonTextContent = contents.some((child) => child.type !== 'text' && child.type !== 'comment');
    if (hasNonTextContent) {
      return false;
    }

    return node.text().trim().length > 0;
  }

  private nextId(usedIds: Set<string>, initialCounter: number): string {
    let counter = initialCounter;
    while (usedIds.has(`text-${counter}`)) {
      counter += 1;
    }

    const id = `text-${counter}`;
    usedIds.add(id);
    return id;
  }

  private escapeAttributeValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}
