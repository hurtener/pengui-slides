/**
 * Active-session / workspace context for v4.
 *
 * Ephemeral, in-memory record of what the user is currently focused on
 * in the MCP App. The agent reads this via `get_session` to avoid asking
 * "which deck?" every turn. The app updates it via the app-only
 * `set_active_workspace` tool (Wave 3).
 *
 * Not persisted — if the server restarts or the app disconnects, the
 * session resets. Slugs and ids are stable identifiers; the session is
 * just a short-cut.
 */

import type { DeckId, SoulId } from './common.js';
import type { FormatKind } from './format.js';
import type { AuthoringModel } from './deck.js';
import type { SoulStatus } from './design-soul.js';

export type ActiveWorkflow = 'create-presentation' | 'create-document';

export interface SessionDeckView {
  id: DeckId;
  slug: string;
  title: string;
  format: FormatKind;
  authoringModel: AuthoringModel;
}

export interface SessionSoulView {
  id: SoulId;
  slug: string;
  name: string;
  status: SoulStatus;
}

export interface SessionView {
  activeDeck?: SessionDeckView;
  activeSoul?: SessionSoulView;
  activeWorkflow?: ActiveWorkflow;
  /** Informational — which app routes/panels are open. */
  openPanels: string[];
  /** ISO timestamp when the session was last updated by the app. */
  updatedAt?: string;
}

export interface SetActiveWorkspaceInput {
  deckRef?: string | null;
  soulRef?: string | null;
  workflow?: ActiveWorkflow | null;
  openPanels?: string[];
}
