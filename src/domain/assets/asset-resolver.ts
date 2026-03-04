/**
 * Asset Resolver for Pengui Slides.
 *
 * Replaces asset://ID refs in HTML with data URIs at the render/export
 * boundary. The LLM never sees base64 — only lightweight refs.
 */

import type { AssetService } from './asset-service.js';
import { assetId } from '../../types/common.js';

/**
 * Matches asset://UUID refs in HTML.
 * UUIDs are lowercase hex with dashes: 8-4-4-4-12
 */
const ASSET_REF_REGEX = /asset:\/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;

/**
 * Replace all asset://ID refs in HTML with data URIs.
 * Used at the render/export boundary — never in LLM-facing paths.
 *
 * Unknown asset IDs are left as-is (the ref remains unresolved).
 */
export async function resolveAssetRefs(
  html: string,
  assetService: AssetService,
): Promise<string> {
  // Collect all unique asset IDs from the HTML
  const matches = [...html.matchAll(ASSET_REF_REGEX)];
  if (matches.length === 0) return html;

  const uniqueIds = [...new Set(matches.map((m) => m[1]))];

  // Batch-load all data URIs
  const dataUriMap = new Map<string, string>();
  await Promise.all(
    uniqueIds.map(async (id) => {
      const dataUri = await assetService.getDataUri(assetId(id));
      if (dataUri) {
        dataUriMap.set(id, dataUri);
      }
    }),
  );

  // Replace refs with data URIs in a single pass
  return html.replace(ASSET_REF_REGEX, (fullMatch, id: string) => {
    const dataUri = dataUriMap.get(id);
    return dataUri ?? fullMatch;
  });
}
