/**
 * MCP App Tool: upload_asset_from_app
 *
 * App-only tool (visibility: ['app']). Accepts base64-encoded image data
 * directly from the MCP App and stores it as an asset. Because this tool
 * is app-only, the base64 payload NEVER crosses the LLM transcript —
 * the app sends binary data directly and the model only ever sees the
 * lightweight `asset://UUID` ref returned by this tool.
 *
 * Enforces a 5 MB payload cap.
 */

import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { DECK_EDITOR_RESOURCE_URI } from '../../resources/app-resources.js';
import { handleToolError } from '../_shared/error-handler.js';
import { structuredResponse } from '../_shared/responses.js';
import { PenguiError, ErrorCode } from '../../types/errors.js';
import { AssetService } from '../../domain/assets/asset-service.js';
import { soulId as toSoulId, deckId as toDeckId } from '../../types/common.js';
import type { AssetScope, AssetMimeType } from '../../types/asset.js';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const scopeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('soul'),
    soul_ref: z.string().describe('Soul UUID or slug.'),
  }),
  z.object({
    type: z.literal('deck'),
    deck_ref: z.string().describe('Deck UUID or slug.'),
  }),
  z.object({
    type: z.literal('global'),
  }),
]);

export function registerUploadAssetFromAppTool(server: McpServer, container: ServiceContainer): void {
  registerAppTool(
    server,
    'upload_asset_from_app',
    {
      title: 'Upload Asset from App',
      description:
        'Upload an image asset from the MCP App (PNG, JPEG, SVG, or WebP). ' +
        'Accepts base64-encoded binary data — because this is an app-only tool, ' +
        'the raw image data NEVER appears in the LLM conversation transcript. ' +
        'Returns an asset:// URI reference and lightweight metadata. ' +
        'Maximum payload: 5 MB after decoding. ' +
        'Use the returned ref as the src of <img> elements in slide HTML.',
      inputSchema: z.object({
        data_base64: z.string().min(1).describe('Base64-encoded image bytes.'),
        mime_type: z
          .enum(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
          .describe('MIME type of the image.'),
        scope: scopeSchema.describe(
          'Scoping: { type: "soul", soul_ref } | { type: "deck", deck_ref } | { type: "global" }',
        ),
        role: z.enum(['logo', 'content']).describe('"logo" for branding marks, "content" for imagery.'),
        label: z.string().optional().describe('Human-readable label; defaults to the mime type.'),
      }),
      _meta: {
        ui: {
          resourceUri: DECK_EDITOR_RESOURCE_URI,
          visibility: ['app'],
        },
      },
    },
    async ({ data_base64, mime_type, scope, role, label }) => {
      try {
        // Enforce size cap before touching the store
        const buf = Buffer.from(data_base64, 'base64');
        if (buf.byteLength > MAX_BYTES) {
          throw new PenguiError(
            ErrorCode.INVALID_INPUT,
            `Asset payload exceeds the 5 MB limit (got ${(buf.byteLength / 1024 / 1024).toFixed(2)} MB).`,
            { sizeBytes: buf.byteLength, limitBytes: MAX_BYTES },
          );
        }

        // Resolve soul_ref / deck_ref to canonical IDs
        const resolvedScope = await resolveScope(scope, container);

        // asset-service only knows png/svg/jpeg — webp maps directly
        const effectiveMime = mime_type as AssetMimeType;
        const name = label ?? mime_type;
        const ext = mime_type.split('/')[1].replace('+xml', '');
        const filename = `${name.toLowerCase().replace(/\s+/g, '-')}.${ext}`;

        const asset = await container.assetService.upload({
          name,
          filename,
          mimeType: effectiveMime,
          scope: resolvedScope,
          role,
          dataBase64: data_base64,
        });

        return structuredResponse(
          {
            ref: AssetService.ref(asset.id),
            asset_id: asset.id,
            name: asset.name,
            mime_type: asset.mimeType,
            size_bytes: asset.sizeBytes,
            scope: asset.scope,
            role: asset.role,
            created_at: asset.createdAt,
          },
          `Asset "${asset.name}" uploaded (${(asset.sizeBytes / 1024).toFixed(1)} KB)`,
        );
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}

async function resolveScope(
  scope: z.infer<typeof scopeSchema>,
  container: ServiceContainer,
): Promise<AssetScope> {
  switch (scope.type) {
    case 'soul': {
      const sid = await container.soulService.resolveRefOrThrow(scope.soul_ref);
      return { type: 'soul', soulId: toSoulId(sid as string) };
    }
    case 'deck': {
      const did = await container.deckService.resolveRefOrThrow(scope.deck_ref);
      return { type: 'deck', deckId: toDeckId(did as string) };
    }
    default:
      return { type: 'global' };
  }
}
