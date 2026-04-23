/**
 * Network Isolation Check (Stage 1)
 *
 * Ensures the slide HTML contains no external URL references.
 * All resources must be inlined or use data: URIs.
 */

import type { Stage1Check, ValidationIssue } from '../../../types/validation.js';

/**
 * Patterns to detect external URL references.
 * Each entry is [regex, description] for reporting purposes.
 */
const EXTERNAL_URL_PATTERNS: Array<[RegExp, string]> = [
  // Explicit http(s) URLs
  [/https?:\/\/[^\s"'<>)]+/gi, 'HTTP/HTTPS URL'],
  // Protocol-relative URLs (//example.com)
  [/(?<!=)\/\/(?![\s*])(?![^"']*["'][^"']*$)[a-zA-Z0-9][^\s"'<>)]+\.[a-zA-Z]{2,}/gi, 'Protocol-relative URL'],
];

/**
 * Specific attribute patterns for href, src, @import, url()
 */
const ATTRIBUTE_URL_PATTERNS: Array<[RegExp, string]> = [
  [/\bhref\s*=\s*["']\s*(https?:\/\/[^"']+)/gi, 'External href'],
  [/\bsrc\s*=\s*["']\s*(https?:\/\/[^"']+)/gi, 'External src'],
  [/\bhref\s*=\s*["']\s*(\/\/[^"']+)/gi, 'Protocol-relative href'],
  [/\bsrc\s*=\s*["']\s*(\/\/[^"']+)/gi, 'Protocol-relative src'],
  [/@import\s+(?:url\s*\()?\s*["']?\s*(https?:\/\/[^"');\s]+)/gi, 'External @import'],
  [/@import\s+(?:url\s*\()?\s*["']?\s*(\/\/[^"');\s]+)/gi, 'Protocol-relative @import'],
  [/url\s*\(\s*["']?\s*(https?:\/\/[^"')]+)/gi, 'External url()'],
  [/url\s*\(\s*["']?\s*(\/\/[^"')]+)/gi, 'Protocol-relative url()'],
];

/**
 * Check if a URL is a data: URI (which is allowed).
 */
function isDataUri(url: string): boolean {
  return url.trim().toLowerCase().startsWith('data:');
}

/**
 * URLs that are allowed because they are namespace identifiers, not
 * network references. SVG and XLink xmlns values appear in HTML/SVG
 * markup but the browser never fetches them.
 */
const ALLOWED_NAMESPACE_URLS = new Set<string>([
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.w3.org/2000/svg/',
]);

function isAllowedNamespaceUrl(url: string): boolean {
  return ALLOWED_NAMESPACE_URLS.has(url.trim().toLowerCase());
}

/**
 * Find character spans inside `xmlns` (or `xmlns:foo`) attribute values,
 * which hold namespace identifiers that the browser never fetches. Any
 * URL match falling inside one of these spans is markup, not network.
 */
function findXmlnsSpans(html: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const re = /\bxmlns(?::[a-zA-Z0-9_-]+)?\s*=\s*"([^"]*)"|\bxmlns(?::[a-zA-Z0-9_-]+)?\s*=\s*'([^']*)'/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const valueStart = m.index + m[0].lastIndexOf(m[1] ?? m[2] ?? '');
    const valueEnd = valueStart + (m[1] ?? m[2] ?? '').length;
    spans.push([valueStart, valueEnd]);
  }
  return spans;
}

function isInsideSpan(matchIndex: number, matchLength: number, spans: Array<[number, number]>): boolean {
  const matchEnd = matchIndex + matchLength;
  for (const [start, end] of spans) {
    if (matchIndex >= start && matchEnd <= end) return true;
  }
  return false;
}

export class NetworkIsolationCheck implements Stage1Check {
  readonly id = 'network-isolation';
  readonly name = 'Network Isolation';

  run(html: string, _soulTokenNames: string[], _allowedFonts: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const seen = new Set<string>();
    const xmlnsSpans = findXmlnsSpans(html);

    // Check attribute-level patterns (more specific, better messages)
    for (const [pattern, description] of ATTRIBUTE_URL_PATTERNS) {
      // Reset lastIndex for global regex
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(html)) !== null) {
        const url = match[1];
        if (isDataUri(url)) continue;

        const key = `${description}:${url}`;
        if (seen.has(key)) continue;
        seen.add(key);

        issues.push({
          id: `${this.id}-${issues.length}`,
          stage: 'stage1_lint',
          severity: 'error',
          rule: this.id,
          message: `${description} detected: "${url.slice(0, 80)}". External resources are not allowed.`,
          actual: url.slice(0, 120),
          fixSuggestion: 'Inline the resource or use a data: URI instead of an external URL.',
        });
      }
    }

    // Broad sweep for any remaining external URLs not caught above
    for (const [pattern, description] of EXTERNAL_URL_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(html)) !== null) {
        const url = match[0];
        if (isDataUri(url)) continue;
        // Skip XML namespace identifiers — they are markup, not network references.
        if (isAllowedNamespaceUrl(url)) continue;
        if (isInsideSpan(match.index, url.length, xmlnsSpans)) continue;

        const key = `broad:${url}`;
        if (seen.has(key)) continue;

        // Check if this URL was already caught by a more specific pattern
        let alreadyCaught = false;
        for (const seenKey of seen) {
          if (seenKey.includes(url.slice(0, 40))) {
            alreadyCaught = true;
            break;
          }
        }
        if (alreadyCaught) continue;

        seen.add(key);

        issues.push({
          id: `${this.id}-${issues.length}`,
          stage: 'stage1_lint',
          severity: 'error',
          rule: this.id,
          message: `${description} detected: "${url.slice(0, 80)}". External resources are not allowed.`,
          actual: url.slice(0, 120),
          fixSuggestion: 'Remove or inline the external resource. Use data: URIs for embedded content.',
        });
      }
    }

    return issues;
  }
}
