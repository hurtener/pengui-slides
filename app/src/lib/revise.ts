import type { RevisionPayload } from './types';

export function buildRevisionPrompt(payload: RevisionPayload): string {
  return [
    `Revise slide "${payload.slide_title}" in deck "${payload.deck_title}".`,
    `Instruction: ${payload.instruction}`,
    'Use the attached model context for the current slide HTML, metadata, and validation issues.',
    'Preserve the slide structure, keep metadata semantically aligned, and maintain Design Soul compliance.',
  ].join('\n');
}

export function buildRevisionFallback(payload: RevisionPayload): string {
  return JSON.stringify({
    prompt: buildRevisionPrompt(payload),
    context: payload,
  }, null, 2);
}
