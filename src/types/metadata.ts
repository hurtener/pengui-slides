/**
 * Slide metadata types for Pengui Slides.
 *
 * Every slide carries structured metadata that serves three purposes:
 * 1. Informs the agent during deck construction
 * 2. Gets embedded in exported files for searchability
 * 3. Enables RAG-based retrieval across presentation history
 */

export type ConfidentialityLevel = 'public' | 'internal' | 'confidential' | 'restricted';

export type SlideType =
  | 'title'
  | 'content'
  | 'two-column'
  | 'metrics'
  | 'features'
  | 'comparison'
  | 'quote'
  | 'image'
  | 'timeline'
  | 'closing'
  | 'blank'
  | 'custom';

export interface DataPoint {
  label: string;
  value: string | number;
  unit?: string;
  source?: string;
  period?: string;
  trend?: 'up' | 'down' | 'flat';
}

export interface SlideSource {
  url?: string;
  title?: string;
  quoteSpan?: string;
  confidence?: number;
  retrievedAt?: string;
}

export interface SlideMetadata {
  // Required
  title: string;
  type: SlideType;

  // Content extraction
  narrative: string;
  keyPoints: string[];

  // Structured data
  dataPoints: DataPoint[];

  // Taxonomy
  tags: string[];
  audience?: string;
  confidentiality?: ConfidentialityLevel;

  // Provenance
  generatedAt: string;
  soulId: string;
  deckId: string;
  position: number;

  // Schema versioning
  metaVersion: '1.0';
  revisionHash: string;

  // Source attribution
  sources?: SlideSource[];
}

/**
 * Partial metadata for creation/update operations where
 * provenance fields are auto-populated.
 */
export interface SlideMetadataInput {
  title: string;
  type: SlideType;
  narrative: string;
  keyPoints?: string[];
  dataPoints?: DataPoint[];
  tags?: string[];
  audience?: string;
  confidentiality?: ConfidentialityLevel;
  sources?: SlideSource[];
}
