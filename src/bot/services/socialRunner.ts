import { runSocial, getAvailablePlatforms } from "../../social";
import type { SocialOutput } from "../../social/types";

/**
 * Validate platform names against the social registry.
 * Throws on invalid names — call at startup to fail fast.
 */
export function validateSocialPlatforms(platforms: string[]): void {
  if (platforms.length === 0) return;
  const available = getAvailablePlatforms();
  const invalid = platforms.filter((p) => !available.includes(p));
  if (invalid.length > 0) {
    throw new Error(
      `Invalid WORKSHOT_BOT_SOCIAL_PLATFORMS: "${invalid.join(", ")}". ` +
        `Available: ${available.join(", ")}`
    );
  }
}

/** Result of bot social generation attempt. */
export interface BotSocialResult {
  success: boolean;
  outputs?: SocialOutput[];
  error?: string;
}

/**
 * Run social output generation for a completed job.
 *
 * Never throws — returns a structured result. Caller should
 * treat failure as non-blocking (log and continue).
 */
export async function runBotSocial(
  jobDir: string,
  platforms: string[]
): Promise<BotSocialResult> {
  if (platforms.length === 0) {
    return { success: true, outputs: [] };
  }

  try {
    const outputs = await runSocial(jobDir, platforms);
    return { success: true, outputs };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn(`[bot-social] Social generation failed for ${jobDir}: ${msg}`);
    return { success: false, error: msg };
  }
}
