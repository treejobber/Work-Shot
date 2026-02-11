/**
 * Refactor seam regression tests (Phase 5).
 *
 * These tests verify that the module boundary extractions work correctly:
 * - Contract types are importable from src/contracts/
 * - CLI parsing is importable from src/cli/parseArgs
 * - Pipeline modules import from contracts (not from each other's types)
 * - Re-exports from pipeline modules still work for backward compat
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("contract boundary seams", () => {
  it("src/contracts/types.ts exports all shared types", async () => {
    // Dynamic import to verify the compiled contract module loads
    const contracts = await import("../src/contracts");

    // These are type-only exports, so we verify the module loads without error.
    // The fact that this import succeeds and the build passes confirms the types exist.
    expect(contracts).toBeDefined();
  });

  it("caption.ts imports from contracts, not from ingest", () => {
    const captionSource = fs.readFileSync(
      path.resolve(__dirname, "..", "src", "pipeline", "caption.ts"),
      "utf-8"
    );
    expect(captionSource).not.toContain('from "./ingest"');
    expect(captionSource).not.toContain("from './ingest'");
    expect(captionSource).toContain("from \"../contracts\"");
  });

  it("manifest.ts imports from contracts, not from peer pipeline modules", () => {
    const manifestSource = fs.readFileSync(
      path.resolve(__dirname, "..", "src", "pipeline", "manifest.ts"),
      "utf-8"
    );
    expect(manifestSource).not.toContain('from "./ingest"');
    expect(manifestSource).not.toContain('from "./compose"');
    expect(manifestSource).toContain("from \"../contracts\"");
  });

  it("ingest.ts re-exports contract types for backward compatibility", () => {
    const ingestSource = fs.readFileSync(
      path.resolve(__dirname, "..", "src", "pipeline", "ingest.ts"),
      "utf-8"
    );
    // Must re-export so existing consumers don't break
    expect(ingestSource).toContain("export type { JobMeta");
    expect(ingestSource).toContain("export type {");
  });

  it("compose.ts re-exports Layout for backward compatibility", () => {
    const composeSource = fs.readFileSync(
      path.resolve(__dirname, "..", "src", "pipeline", "compose.ts"),
      "utf-8"
    );
    expect(composeSource).toContain("export type { Layout }");
  });
});

describe("CLI boundary seams", () => {
  it("src/cli/parseArgs.ts exists and exports parseArgs", async () => {
    const cliModule = await import("../src/cli/parseArgs");
    expect(typeof cliModule.parseArgs).toBe("function");
  });

  it("index.ts imports parseArgs from cli module, not inline", () => {
    const indexSource = fs.readFileSync(
      path.resolve(__dirname, "..", "src", "index.ts"),
      "utf-8"
    );
    expect(indexSource).toContain('from "./cli/parseArgs"');
    // Should NOT have an inline parseArgs function definition
    expect(indexSource).not.toContain("function parseArgs");
  });

  it("index.ts does not define CLI arg type interfaces inline", () => {
    const indexSource = fs.readFileSync(
      path.resolve(__dirname, "..", "src", "index.ts"),
      "utf-8"
    );
    expect(indexSource).not.toContain("interface RunArgs");
    expect(indexSource).not.toContain("interface ValidateArgs");
    expect(indexSource).not.toContain("interface LegacyArgs");
  });
});

describe("legacy removal seams (Phase 6)", () => {
  it("parseArgs.ts does not contain --job parsing", () => {
    const parseArgsSource = fs.readFileSync(
      path.resolve(__dirname, "..", "src", "cli", "parseArgs.ts"),
      "utf-8"
    );
    expect(parseArgsSource).not.toContain('"--job"');
    expect(parseArgsSource).not.toContain("LegacyArgs");
    expect(parseArgsSource).not.toContain('"legacy"');
  });

  it("ingest.ts does not contain meta.json handling", () => {
    const ingestSource = fs.readFileSync(
      path.resolve(__dirname, "..", "src", "pipeline", "ingest.ts"),
      "utf-8"
    );
    expect(ingestSource).not.toContain("checkMetaJson");
    expect(ingestSource).not.toContain("meta.json");
    expect(ingestSource).not.toContain("makeDefaultJobJson");
  });

  it("index.ts does not contain legacy --job handler", () => {
    const indexSource = fs.readFileSync(
      path.resolve(__dirname, "..", "src", "index.ts"),
      "utf-8"
    );
    expect(indexSource).not.toContain("--job");
    expect(indexSource).not.toContain("assertContainedIn");
    expect(indexSource).not.toContain("meta.json");
  });
});
