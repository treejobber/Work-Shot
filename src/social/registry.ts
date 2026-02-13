/**
 * Platform registry — maps platform names to adapter factories.
 *
 * Adding a new platform:
 * 1. Create src/social/platforms/<name>.ts implementing PlatformAdapter
 * 2. Register it here
 */

import type { PlatformAdapter } from "./types";
import { createNextdoorAdapter } from "./platforms/nextdoor";
import { createFacebookAdapter } from "./platforms/facebook";

type AdapterFactory = () => PlatformAdapter;

const REGISTRY: Record<string, AdapterFactory> = {
  nextdoor: createNextdoorAdapter,
  facebook: createFacebookAdapter,
};

export function getAdapter(platform: string): PlatformAdapter {
  const factory = REGISTRY[platform];
  if (!factory) {
    const available = Object.keys(REGISTRY).join(", ");
    throw new Error(
      `Unknown platform "${platform}". Available: ${available}`
    );
  }
  return factory();
}

export function getAvailablePlatforms(): string[] {
  return Object.keys(REGISTRY);
}
