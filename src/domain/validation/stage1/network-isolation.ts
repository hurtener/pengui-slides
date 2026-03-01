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

export class NetworkIsolationCheck implements Stage1Check {
  readonly id = 'network-isolation';
  readonly name = 'Network Isolation';

  run(html: string, _soulTokenNames: string[], _allowedFonts: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const seen = new Set<string>();

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
