import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface TestJobOptions {
  meta?: Record<string, unknown> | null;
  jobJson?: Record<string, unknown> | null;
  skipBefore?: boolean;
  skipAfter?: boolean;
}

/**
 * Create a temporary job directory with synthetic before/after images.
 * Returns the path to the job directory. Caller is responsible for cleanup.
 *
 * - If `jobJson` is provided, writes job.json (and skips meta.json).
 * - If `meta` is provided (and jobJson is not), writes meta.json.
 * - If `meta` is null, skips meta.json.
 * - Default: writes meta.json with tree trim defaults.
 */
export async function createTestJob(options?: TestJobOptions): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workshot-test-"));

  if (!options?.skipBefore) {
    const beforePng = await sharp({
      create: {
        width: 200,
        height: 150,
        channels: 3,
        background: { r: 34, g: 139, b: 34 },
      },
    })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(dir, "before.png"), beforePng);
  }

  if (!options?.skipAfter) {
    const afterPng = await sharp({
      create: {
        width: 200,
        height: 150,
        channels: 3,
        background: { r: 139, g: 69, b: 19 },
      },
    })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(dir, "after.png"), afterPng);
  }

  // job.json takes priority over meta.json
  if (options?.jobJson !== undefined && options.jobJson !== null) {
    fs.writeFileSync(
      path.join(dir, "job.json"),
      JSON.stringify(options.jobJson, null, 2)
    );
  } else if (options?.meta !== null) {
    const meta = options?.meta ?? { service: "tree trim", notes: "Test job" };
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta));
  }

  return dir;
}

/**
 * Remove a test job directory and all contents.
 */
export function cleanupTestJob(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}
