/**
 * Ref-resolver helper for v4 tools.
 *
 * Decks and Souls carry both a UUID (`id`) and a human-readable `slug`.
 * Most service methods accept either and resolve internally, so direct
 * tool code rarely needs this helper. It's here for:
 *
 *   1. Tools that want to surface a resolved id in their response payload
 *      (e.g. `list_decks` echoing back the canonical id) before calling the
 *      service.
 *   2. Tools that do work before entering a service method and need the
 *      canonical form (e.g. logging, cross-service lookups).
 *
 * Both functions throw the domain-typed NotFound error if the ref is
 * unknown — same semantics as the service-level `resolveRefOrThrow`.
 */

import type { ServiceContainer } from '../../container.js';
import type { DeckId, SoulId } from '../../types/common.js';

export async function resolveDeckRef(
  container: ServiceContainer,
  ref: string,
): Promise<DeckId> {
  return container.deckService.resolveRefOrThrow(ref);
}

export async function resolveSoulRef(
  container: ServiceContainer,
  ref: string,
): Promise<SoulId> {
  return container.soulService.resolveRefOrThrow(ref);
}
