/**
 * Shared contract types for the WorkShot pipeline.
 *
 * All pipeline modules import shared types from here.
 * No pipeline module should import types from another pipeline module.
 */

// --- Layout ---

export type Layout = "side-by-side" | "stacked";

// --- Job Metadata ---

export interface JobMeta {
  service?: string;
  notes?: string | null;
}

// --- Job JSON Schema (v1) ---

export interface JobJson {
  schemaVersion: string;
  jobId: string;
  createdAt: string;
  source: {
    type: string;
    sourceRef: string | null;
    messageId: string | null;
    threadId: string | null;
  };
  customer: {
    name: string | null;
    phone: string | null;
    address: string | null;
  };
  businessOwner: {
    phone: string | null;
  };
  work: {
    service: string;
    notes: string | null;
    workType: string | null;
    crew: string | null;
    workDate: string | null;
  };
  targets: {
    platforms: string[];
    publish: boolean;
  };
  media: {
    pairs: Array<{
      pairId: string;
      before: string;
      after: string;
      mediaType: string;
    }>;
  };
}

// --- Ingest Result ---

export interface IngestResult {
  jobDir: string;
  beforePath: string;
  afterPath: string;
  meta: JobMeta | null;
  jobJson: JobJson;
  metaSource: "job.json";
}

// --- Validation Result ---

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
