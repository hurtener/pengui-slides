/**
 * UUID generation utility.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  soulId,
  deckId,
  slideId,
  revisionId,
  templateId,
  type SoulId,
  type DeckId,
  type SlideId,
  type RevisionId,
  type TemplateId,
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

export function generateRevisionId(): RevisionId {
  return revisionId(uuidv4());
}

export function generateTemplateId(): TemplateId {
  return templateId(uuidv4());
}
