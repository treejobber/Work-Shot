import * as fs from "fs";
import * as path from "path";
import type { JobJson } from "../../contracts";

export interface CreateJobOptions {
  jobsDir: string;
  chatId: number;
  service: string;
  notes: string | null;
}

export interface CreatedJob {
  jobDir: string;
  jobId: string;
}

/**
 * Creates a job folder with a unique name based on chat ID and timestamp.
 * Does NOT write job.json yet — that happens when both photos arrive.
 */
export function createJobFolder(opts: CreateJobOptions): CreatedJob {
  const timestamp = Date.now();
  const jobId = `tg-${opts.chatId}-${timestamp}`;
  const jobDir = path.join(opts.jobsDir, jobId);

  fs.mkdirSync(jobDir, { recursive: true });

  return { jobDir, jobId };
}

/**
 * Writes a complete R1-compatible job.json into the job folder.
 * Called when both photos are present.
 */
export function writeJobJson(opts: {
  jobDir: string;
  jobId: string;
  service: string;
  notes: string | null;
  beforeFilename: string;
  afterFilename: string;
  chatId: number;
}): void {
  const jobJson: JobJson = {
    schemaVersion: "1.0",
    jobId: opts.jobId,
    createdAt: new Date().toISOString(),
    source: {
      type: "telegram",
      sourceRef: String(opts.chatId),
      messageId: null,
      threadId: null,
    },
    customer: {
      name: null,
      phone: null,
      address: null,
    },
    businessOwner: {
      phone: null,
    },
    work: {
      service: opts.service,
      notes: opts.notes,
      workType: null,
      crew: null,
      workDate: null,
    },
    targets: {
      platforms: ["generic"],
      publish: false,
    },
    media: {
      pairs: [
        {
          pairId: "primary",
          before: opts.beforeFilename,
          after: opts.afterFilename,
          mediaType: "photo",
        },
      ],
    },
  };

  const jobJsonPath = path.join(opts.jobDir, "job.json");
  fs.writeFileSync(jobJsonPath, JSON.stringify(jobJson, null, 2), "utf-8");
}
