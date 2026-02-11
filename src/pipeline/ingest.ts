import * as fs from "fs";
import * as path from "path";
import { assertSafeFilename } from "../lib/pathSafety";
import type {
  JobMeta,
  JobJson,
  IngestResult,
  ValidationResult,
} from "../contracts";

// Re-export contract types so existing consumers of ingest don't break.
export type { JobMeta, JobJson, IngestResult, ValidationResult };

// --- Constants ---

const BEFORE_PATTERNS = ["before.jpg", "before.jpeg", "before.png"];
const AFTER_PATTERNS = ["after.jpg", "after.jpeg", "after.png"];

// --- Shared Validation Primitives ---

/**
 * Check that a path exists and is a directory.
 * Returns errors if not.
 */
function checkJobDir(jobPath: string): string[] {
  if (!fs.existsSync(jobPath)) {
    return [`Job folder not found: ${jobPath}`];
  }
  const stat = fs.statSync(jobPath);
  if (!stat.isDirectory()) {
    return [`Job path is not a directory: ${jobPath}`];
  }
  return [];
}

/**
 * Scan directory for before/after images.
 * Returns { beforeMatches, afterMatches, errors }.
 */
function checkImages(jobPath: string): {
  beforeMatches: string[];
  afterMatches: string[];
  errors: string[];
} {
  let files: string[];
  try {
    files = fs.readdirSync(jobPath);
  } catch {
    return {
      beforeMatches: [],
      afterMatches: [],
      errors: [`Cannot read job folder: ${jobPath}`],
    };
  }

  const beforeMatches = files.filter((f) =>
    BEFORE_PATTERNS.includes(f.toLowerCase())
  );
  const afterMatches = files.filter((f) =>
    AFTER_PATTERNS.includes(f.toLowerCase())
  );

  const errors: string[] = [];
  if (beforeMatches.length === 0) {
    errors.push(
      `No before image found. Expected one of: ${BEFORE_PATTERNS.join(", ")}`
    );
  } else if (beforeMatches.length > 1) {
    errors.push(
      `Ambiguous before images: ${beforeMatches.join(", ")}. Keep only one.`
    );
  }

  if (afterMatches.length === 0) {
    errors.push(
      `No after image found. Expected one of: ${AFTER_PATTERNS.join(", ")}`
    );
  } else if (afterMatches.length > 1) {
    errors.push(
      `Ambiguous after images: ${afterMatches.join(", ")}. Keep only one.`
    );
  }

  return { beforeMatches, afterMatches, errors };
}

/**
 * Attempt to parse and validate job.json.
 * Returns { jobJson, errors, warnings } or null if file doesn't exist.
 *
 * Malformed metadata policy:
 * - Invalid JSON -> error (fail-fast)
 * - Not an object -> error
 * - Missing required field (work.service, media.pairs with at least one entry) -> error
 * - Missing optional fields -> silently defaulted
 * - Unsafe media filenames -> error
 */
function checkJobJson(
  jobPath: string
): {
  exists: boolean;
  jobJson: JobJson | null;
  errors: string[];
  warnings: string[];
} {
  const jobJsonPath = path.join(jobPath, "job.json");
  if (!fs.existsSync(jobJsonPath)) {
    return { exists: false, jobJson: null, errors: [], warnings: [] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  let content: string;
  try {
    content = fs.readFileSync(jobJsonPath, "utf-8");
  } catch {
    errors.push("job.json cannot be read.");
    return { exists: true, jobJson: null, errors, warnings };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    errors.push("job.json contains invalid JSON.");
    return { exists: true, jobJson: null, errors, warnings };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    errors.push("job.json must be a JSON object.");
    return { exists: true, jobJson: null, errors, warnings };
  }

  const obj = parsed as Record<string, unknown>;

  // Validate required fields
  const work = obj.work as Record<string, unknown> | undefined;
  if (!work || typeof work !== "object") {
    errors.push("job.json: missing required 'work' object.");
  } else if (typeof work.service !== "string" || work.service.length === 0) {
    errors.push("job.json: 'work.service' is required and must be a non-empty string.");
  }

  const media = obj.media as Record<string, unknown> | undefined;
  if (!media || typeof media !== "object") {
    errors.push("job.json: missing required 'media' object.");
  } else {
    const pairs = media.pairs;
    if (!Array.isArray(pairs) || pairs.length === 0) {
      errors.push("job.json: 'media.pairs' must be a non-empty array.");
    } else {
      // Validate media filenames are safe (no path traversal)
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i] as Record<string, unknown>;
        if (typeof pair.before === "string") {
          try {
            assertSafeFilename(pair.before, `media.pairs[${i}].before`);
          } catch (err) {
            errors.push(`job.json: ${(err as Error).message}`);
          }
        }
        if (typeof pair.after === "string") {
          try {
            assertSafeFilename(pair.after, `media.pairs[${i}].after`);
          } catch (err) {
            errors.push(`job.json: ${(err as Error).message}`);
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    return { exists: true, jobJson: null, errors, warnings };
  }

  // Build validated JobJson with defaults for optional fields
  const jobJson: JobJson = {
    schemaVersion: typeof obj.schemaVersion === "string" ? obj.schemaVersion : "1.0",
    jobId: typeof obj.jobId === "string" ? obj.jobId : path.basename(jobPath),
    createdAt: typeof obj.createdAt === "string" ? obj.createdAt : new Date().toISOString(),
    source: {
      type: (obj.source as Record<string, unknown>)?.type as string ?? "manual",
      sourceRef: (obj.source as Record<string, unknown>)?.sourceRef as string | null ?? null,
      messageId: (obj.source as Record<string, unknown>)?.messageId as string | null ?? null,
      threadId: (obj.source as Record<string, unknown>)?.threadId as string | null ?? null,
    },
    customer: {
      name: (obj.customer as Record<string, unknown>)?.name as string | null ?? null,
      phone: (obj.customer as Record<string, unknown>)?.phone as string | null ?? null,
      address: (obj.customer as Record<string, unknown>)?.address as string | null ?? null,
    },
    businessOwner: {
      phone: (obj.businessOwner as Record<string, unknown>)?.phone as string | null ?? null,
    },
    work: {
      service: (work as Record<string, unknown>).service as string,
      notes: typeof (work as Record<string, unknown>).notes === "string" ? (work as Record<string, unknown>).notes as string : null,
      workType: (work as Record<string, unknown>).workType as string | null ?? null,
      crew: (work as Record<string, unknown>).crew as string | null ?? null,
      workDate: (work as Record<string, unknown>).workDate as string | null ?? null,
    },
    targets: {
      platforms: Array.isArray((obj.targets as Record<string, unknown>)?.platforms)
        ? (obj.targets as Record<string, unknown>).platforms as string[]
        : ["generic"],
      publish: typeof (obj.targets as Record<string, unknown>)?.publish === "boolean"
        ? (obj.targets as Record<string, unknown>).publish as boolean
        : false,
    },
    media: {
      pairs: ((media as Record<string, unknown>).pairs as Array<Record<string, unknown>>).map(
        (p) => ({
          pairId: typeof p.pairId === "string" ? p.pairId : "primary",
          before: typeof p.before === "string" ? p.before : "before.jpg",
          after: typeof p.after === "string" ? p.after : "after.jpg",
          mediaType: typeof p.mediaType === "string" ? p.mediaType : "photo",
        })
      ),
    },
  };

  return { exists: true, jobJson, errors: [], warnings };
}

// --- Public API ---

/**
 * Validate a job directory without running the pipeline.
 * Uses the same validation primitives as ingestJob().
 */
export function validateJob(jobPath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check directory
  const dirErrors = checkJobDir(jobPath);
  if (dirErrors.length > 0) {
    return { valid: false, errors: dirErrors, warnings };
  }

  // Check images
  const imageResult = checkImages(jobPath);
  errors.push(...imageResult.errors);

  // Check metadata — job.json is required
  const jobJsonResult = checkJobJson(jobPath);

  if (!jobJsonResult.exists) {
    errors.push("job.json is required but not found.");
  } else {
    errors.push(...jobJsonResult.errors);
    warnings.push(...jobJsonResult.warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Ingest a job directory for pipeline processing.
 * Uses the same validation primitives as validateJob().
 * Fails fast on errors.
 */
export async function ingestJob(jobPath: string): Promise<IngestResult> {
  // Check directory
  const dirErrors = checkJobDir(jobPath);
  if (dirErrors.length > 0) {
    throw new Error(dirErrors[0]);
  }

  // Check images
  const imageResult = checkImages(jobPath);
  if (imageResult.errors.length > 0) {
    throw new Error(imageResult.errors[0]);
  }

  const beforePath = path.join(jobPath, imageResult.beforeMatches[0]);
  const afterPath = path.join(jobPath, imageResult.afterMatches[0]);

  // job.json is required
  const jobJsonResult = checkJobJson(jobPath);
  if (!jobJsonResult.exists) {
    throw new Error("job.json is required but not found.");
  }
  if (jobJsonResult.errors.length > 0) {
    throw new Error(jobJsonResult.errors[0]);
  }

  const jobJson = jobJsonResult.jobJson!;
  const meta: JobMeta = {
    service: jobJson.work.service,
    notes: jobJson.work.notes,
  };

  return {
    jobDir: jobPath,
    beforePath,
    afterPath,
    meta,
    jobJson,
    metaSource: "job.json",
  };
}
