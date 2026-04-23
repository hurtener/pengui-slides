/**
 * UUID generation utility.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  soulId,
  deckId,
  slideId,
  sectionId,
  revisionId,
  templateId,
  assetId,
  commentId,
  type SoulId,
  type DeckId,
  type SlideId,
  type SectionId,
  type RevisionId,
  type TemplateId,
  type AssetId,
  type CommentId,
} from '../types/common.js';

export function generateSoulId(): SoulId {
  return soulId(uuidv4());
}

export function generateDeckId(): DeckId {
  return deckId(uuidv4());
}

export function generateSlideId(): SlideId {
  return slideId(uuidv4());
}

export function generateSectionId(): SectionId {
  return sectionId(uuidv4());
}

export function generateRevisionId(): RevisionId {
  return revisionId(uuidv4());
}

export function generateTemplateId(): TemplateId {
  return templateId(uuidv4());
}

export function generateAssetId(): AssetId {
  return assetId(uuidv4());
}

export function generateCommentId(): CommentId {
  return commentId(uuidv4());
}
