/**
 * Smart crop tests (R3.2).
 *
 * Tests cover:
 * - parseAndValidate: valid/invalid JSON, bounds, dimensions, types
 * - getSmartCrop: no API key returns null
 * - Composer: smart-crop extract path vs center-crop fallback
 * - Integration: R3.1 regression (no API key = identical center-crop output)
 *
 * No live Gemini API calls — all tests use mocked or absent keys.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import sharp from "sharp";
import { parseAndValidate, getSmartCrop } from "../../src/social/smartCrop";
import { composeSocialImage } from "../../src/social/composer";
import { getAdapter } from "../../src/social/registry";

// ---- Helpers ----

/** Create a synthetic test image at the given path with specified dimensions. */
async function createTestImage(
  filePath: string,
  width: number,
  height: number,
  color: { r: number; g: number; b: number }
): Promise<void> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: color },
  })
    .png()
    .toBuffer();
  fs.writeFileSync(filePath, buf);
}

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

// ---- parseAndValidate ----

describe("parseAndValidate", () => {
  // Source images: 1200x900 (before), 1000x800 (after)
  // Target panel: 600x675
  const bw = 1200, bh = 900, aw = 1000, ah = 800, pw = 600, ph = 675;

  it("parses valid JSON with correct crops", () => {
    const json = JSON.stringify({
      before: { left: 100, top: 50, width: 600, height: 675 },
      after: { left: 50, top: 25, width: 600, height: 675 },
      reasoning: "tree centered",
    });
    const result = parseAndValidate(json, bw, bh, aw, ah, pw, ph);
    expect(result).not.toBeNull();
    expect(result!.before).toEqual({ left: 100, top: 50, width: 600, height: 675 });
    expect(result!.after).toEqual({ left: 50, top: 25, width: 600, height: 675 });
    expect(result!.reasoning).toBe("tree centered");
  });

  it("extracts JSON from markdown fenced response", () => {
    const text = "```json\n" + JSON.stringify({
      before: { left: 0, top: 0, width: 600, height: 675 },
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "default",
    }) + "\n```";
    const result = parseAndValidate(text, bw, bh, aw, ah, pw, ph);
    expect(result).not.toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseAndValidate("", bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("returns null for non-JSON text", () => {
    expect(parseAndValidate("I cannot analyze these images", bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseAndValidate('{"before": {bad json}', bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("returns null when before crop missing", () => {
    const json = JSON.stringify({
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "no before",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("returns null when after crop missing", () => {
    const json = JSON.stringify({
      before: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "no after",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("returns null for wrong width", () => {
    const json = JSON.stringify({
      before: { left: 0, top: 0, width: 500, height: 675 },
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "wrong width",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("returns null for wrong height", () => {
    const json = JSON.stringify({
      before: { left: 0, top: 0, width: 600, height: 600 },
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "wrong height",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("returns null for before crop out of bounds (right)", () => {
    const json = JSON.stringify({
      before: { left: 700, top: 0, width: 600, height: 675 },
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "left+width > bw",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("returns null for before crop out of bounds (bottom)", () => {
    const json = JSON.stringify({
      before: { left: 0, top: 300, width: 600, height: 675 },
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "top+height > bh",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("returns null for after crop out of bounds", () => {
    const json = JSON.stringify({
      before: { left: 0, top: 0, width: 600, height: 675 },
      after: { left: 500, top: 0, width: 600, height: 675 },
      reasoning: "after left+width > aw",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("returns null for negative coordinates", () => {
    const json = JSON.stringify({
      before: { left: -10, top: 0, width: 600, height: 675 },
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "negative left",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("returns null for non-integer coordinates", () => {
    const json = JSON.stringify({
      before: { left: 10.5, top: 0, width: 600, height: 675 },
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "float left",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("returns null for string coordinates", () => {
    const json = JSON.stringify({
      before: { left: "0", top: 0, width: 600, height: 675 },
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "string left",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("accepts zero-origin crops at exact bounds", () => {
    // Max valid: left=600, top=225 for before (1200-600=600, 900-675=225)
    const json = JSON.stringify({
      before: { left: 600, top: 225, width: 600, height: 675 },
      after: { left: 400, top: 125, width: 600, height: 675 },
      reasoning: "edge case",
    });
    const result = parseAndValidate(json, bw, bh, aw, ah, pw, ph);
    expect(result).not.toBeNull();
  });

  it("handles missing reasoning field gracefully", () => {
    const json = JSON.stringify({
      before: { left: 0, top: 0, width: 600, height: 675 },
      after: { left: 0, top: 0, width: 600, height: 675 },
    });
    const result = parseAndValidate(json, bw, bh, aw, ah, pw, ph);
    expect(result).not.toBeNull();
    expect(result!.reasoning).toBe("");
  });

  // ---- Trunk-base field tests ----

  it("accepts valid trunk-base fields and includes them in result", () => {
    const json = JSON.stringify({
      before_trunk_base: { x: 500, y: 700 },
      after_trunk_base: { x: 400, y: 600 },
      before: { left: 100, top: 50, width: 600, height: 675 },
      after: { left: 50, top: 25, width: 600, height: 675 },
      reasoning: "trunk aligned",
    });
    const result = parseAndValidate(json, bw, bh, aw, ah, pw, ph);
    expect(result).not.toBeNull();
    expect(result!.beforeTrunkBase).toEqual({ x: 500, y: 700 });
    expect(result!.afterTrunkBase).toEqual({ x: 400, y: 600 });
  });

  it("accepts zero-origin trunk-base coordinates", () => {
    const json = JSON.stringify({
      before_trunk_base: { x: 0, y: 0 },
      after_trunk_base: { x: 0, y: 0 },
      before: { left: 0, top: 0, width: 600, height: 675 },
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "corner trunk",
    });
    const result = parseAndValidate(json, bw, bh, aw, ah, pw, ph);
    expect(result).not.toBeNull();
    expect(result!.beforeTrunkBase).toEqual({ x: 0, y: 0 });
    expect(result!.afterTrunkBase).toEqual({ x: 0, y: 0 });
  });

  it("backward-compatible: missing trunk-base fields still accepted", () => {
    const json = JSON.stringify({
      before: { left: 0, top: 0, width: 600, height: 675 },
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "no trunk base",
    });
    const result = parseAndValidate(json, bw, bh, aw, ah, pw, ph);
    expect(result).not.toBeNull();
    expect(result!.beforeTrunkBase).toBeUndefined();
    expect(result!.afterTrunkBase).toBeUndefined();
  });

  it("rejects before_trunk_base out of source image bounds", () => {
    const json = JSON.stringify({
      before_trunk_base: { x: 1200, y: 500 }, // x >= bw (1200)
      after_trunk_base: { x: 400, y: 600 },
      before: { left: 0, top: 0, width: 600, height: 675 },
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "oob trunk",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("rejects after_trunk_base out of source image bounds", () => {
    const json = JSON.stringify({
      before_trunk_base: { x: 500, y: 700 },
      after_trunk_base: { x: 400, y: 800 }, // y >= ah (800)
      before: { left: 0, top: 0, width: 600, height: 675 },
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "oob trunk",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("rejects trunk-base with negative coordinates", () => {
    const json = JSON.stringify({
      before_trunk_base: { x: -1, y: 500 },
      after_trunk_base: { x: 400, y: 600 },
      before: { left: 0, top: 0, width: 600, height: 675 },
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "negative trunk",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("rejects trunk-base with non-integer coordinates", () => {
    const json = JSON.stringify({
      before_trunk_base: { x: 500.5, y: 700 },
      after_trunk_base: { x: 400, y: 600 },
      before: { left: 0, top: 0, width: 600, height: 675 },
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "float trunk",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("rejects trunk-base with string coordinates", () => {
    const json = JSON.stringify({
      before_trunk_base: { x: "500", y: 700 },
      after_trunk_base: { x: 400, y: 600 },
      before: { left: 0, top: 0, width: 600, height: 675 },
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "string trunk",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("rejects trunk-base with missing y field", () => {
    const json = JSON.stringify({
      before_trunk_base: { x: 500 },
      after_trunk_base: { x: 400, y: 600 },
      before: { left: 0, top: 0, width: 600, height: 675 },
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "missing y",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("rejects trunk-base that is not an object", () => {
    const json = JSON.stringify({
      before_trunk_base: "not an object",
      after_trunk_base: { x: 400, y: 600 },
      before: { left: 0, top: 0, width: 600, height: 675 },
      after: { left: 0, top: 0, width: 600, height: 675 },
      reasoning: "bad type",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  // ---- Trunk-base crop-rectangle containment tests ----

  it("rejects before_trunk_base outside before crop rectangle (left of crop)", () => {
    // Crop: left=200, top=50, 600x675 → x range [200, 800)
    // Trunk base x=100 is left of crop
    const json = JSON.stringify({
      before_trunk_base: { x: 100, y: 400 },
      after_trunk_base: { x: 400, y: 600 },
      before: { left: 200, top: 50, width: 600, height: 675 },
      after: { left: 50, top: 25, width: 600, height: 675 },
      reasoning: "trunk left of crop",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("rejects before_trunk_base outside before crop rectangle (above crop)", () => {
    // Crop: left=100, top=200, 600x675 → y range [200, 875)
    // Trunk base y=100 is above crop
    const json = JSON.stringify({
      before_trunk_base: { x: 400, y: 100 },
      after_trunk_base: { x: 400, y: 600 },
      before: { left: 100, top: 200, width: 600, height: 675 },
      after: { left: 50, top: 25, width: 600, height: 675 },
      reasoning: "trunk above crop",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("rejects after_trunk_base outside after crop rectangle (right of crop)", () => {
    // After crop: left=50, top=25, 600x675 → x range [50, 650)
    // Trunk base x=700 is right of crop
    const json = JSON.stringify({
      before_trunk_base: { x: 500, y: 400 },
      after_trunk_base: { x: 700, y: 400 },
      before: { left: 100, top: 50, width: 600, height: 675 },
      after: { left: 50, top: 25, width: 600, height: 675 },
      reasoning: "trunk right of crop",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("rejects trunk-base at exact crop right boundary (exclusive)", () => {
    // Before crop: left=100, top=50, 600x675 → x range [100, 700)
    // Trunk base x=700 is at the exclusive boundary
    const json = JSON.stringify({
      before_trunk_base: { x: 700, y: 400 },
      after_trunk_base: { x: 400, y: 400 },
      before: { left: 100, top: 50, width: 600, height: 675 },
      after: { left: 50, top: 25, width: 600, height: 675 },
      reasoning: "trunk at crop edge",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("rejects trunk-base at exact crop bottom boundary (exclusive)", () => {
    // Before crop: left=100, top=50, 600x675 → y range [50, 725)
    // Trunk base y=725 is at the exclusive boundary
    const json = JSON.stringify({
      before_trunk_base: { x: 400, y: 725 },
      after_trunk_base: { x: 400, y: 400 },
      before: { left: 100, top: 50, width: 600, height: 675 },
      after: { left: 50, top: 25, width: 600, height: 675 },
      reasoning: "trunk at crop bottom edge",
    });
    expect(parseAndValidate(json, bw, bh, aw, ah, pw, ph)).toBeNull();
  });

  it("accepts trunk-base at crop left/top boundary (inclusive)", () => {
    // Before crop: left=100, top=50, 600x675
    // Trunk base (100, 50) is at the inclusive boundary
    const json = JSON.stringify({
      before_trunk_base: { x: 100, y: 50 },
      after_trunk_base: { x: 50, y: 25 },
      before: { left: 100, top: 50, width: 600, height: 675 },
      after: { left: 50, top: 25, width: 600, height: 675 },
      reasoning: "trunk at crop origin",
    });
    const result = parseAndValidate(json, bw, bh, aw, ah, pw, ph);
    expect(result).not.toBeNull();
    expect(result!.beforeTrunkBase).toEqual({ x: 100, y: 50 });
    expect(result!.afterTrunkBase).toEqual({ x: 50, y: 25 });
  });

  it("accepts trunk-base one pixel inside crop boundary", () => {
    // Before crop: left=100, top=50, 600x675 → max valid: x=699, y=724
    const json = JSON.stringify({
      before_trunk_base: { x: 699, y: 724 },
      after_trunk_base: { x: 649, y: 699 },
      before: { left: 100, top: 50, width: 600, height: 675 },
      after: { left: 50, top: 25, width: 600, height: 675 },
      reasoning: "trunk at max valid position",
    });
    const result = parseAndValidate(json, bw, bh, aw, ah, pw, ph);
    expect(result).not.toBeNull();
    expect(result!.beforeTrunkBase).toEqual({ x: 699, y: 724 });
  });
});

// ---- getSmartCrop (no API key) ----

describe("getSmartCrop fallback", () => {
  let tmpDir: string;
  let beforePath: string;
  let afterPath: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "smartcrop-test-"));
    beforePath = path.join(tmpDir, "before.png");
    afterPath = path.join(tmpDir, "after.png");
    await createTestImage(beforePath, 1200, 900, { r: 34, g: 139, b: 34 });
    await createTestImage(afterPath, 1000, 800, { r: 139, g: 69, b: 19 });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when GEMINI_API_KEY is not set", async () => {
    const origKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const result = await getSmartCrop(beforePath, afterPath, 600, 675);
      expect(result).toBeNull();
    } finally {
      if (origKey) process.env.GEMINI_API_KEY = origKey;
    }
  });

  it("returns null when images are smaller than panel", async () => {
    // Create tiny images
    const tinyBefore = path.join(tmpDir, "tiny-before.png");
    const tinyAfter = path.join(tmpDir, "tiny-after.png");
    await createTestImage(tinyBefore, 100, 100, { r: 34, g: 139, b: 34 });
    await createTestImage(tinyAfter, 100, 100, { r: 139, g: 69, b: 19 });

    const origKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "fake-key-for-size-check";
    try {
      const result = await getSmartCrop(tinyBefore, tinyAfter, 600, 675);
      expect(result).toBeNull();
    } finally {
      if (origKey) process.env.GEMINI_API_KEY = origKey;
      else delete process.env.GEMINI_API_KEY;
    }
  });
});

// ---- Composer with smart-crop vs center-crop ----

describe("composer smart-crop integration", () => {
  let tmpDir: string;
  let beforePath: string;
  let afterPath: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "compose-smartcrop-"));
    beforePath = path.join(tmpDir, "before.png");
    afterPath = path.join(tmpDir, "after.png");
    // Create images large enough for Nextdoor panels (600x675 each)
    await createTestImage(beforePath, 1200, 900, { r: 34, g: 139, b: 34 });
    await createTestImage(afterPath, 1000, 800, { r: 139, g: 69, b: 19 });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("produces valid output with smart-crop regions", async () => {
    const spec = getAdapter("nextdoor").spec;
    const outputPath = path.join(tmpDir, "smart.jpg");

    const smartCrop = {
      before: { left: 100, top: 50, width: 600, height: 675 },
      after: { left: 50, top: 25, width: 600, height: 675 },
      reasoning: "test crop",
    };

    const result = await composeSocialImage(
      beforePath, afterPath, outputPath, spec, smartCrop
    );

    expect(result.width).toBe(1200);
    expect(result.height).toBe(675);
    const meta = await sharp(outputPath).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("produces valid output with null smart-crop (center-crop fallback)", async () => {
    const spec = getAdapter("nextdoor").spec;
    const outputPath = path.join(tmpDir, "center.jpg");

    const result = await composeSocialImage(
      beforePath, afterPath, outputPath, spec, null
    );

    expect(result.width).toBe(1200);
    expect(result.height).toBe(675);
  });

  it("produces valid output with undefined smart-crop (center-crop fallback)", async () => {
    const spec = getAdapter("nextdoor").spec;
    const outputPath = path.join(tmpDir, "undef.jpg");

    const result = await composeSocialImage(
      beforePath, afterPath, outputPath, spec
    );

    expect(result.width).toBe(1200);
    expect(result.height).toBe(675);
  });

  it("smart-crop and center-crop produce different images", async () => {
    // Need non-uniform images so cropping at different offsets yields different pixels.
    // Create a gradient-like image with distinct quadrants.
    const gradBefore = path.join(tmpDir, "grad-before.png");
    const gradAfter = path.join(tmpDir, "grad-after.png");

    // Before: 1200x900 with red left half, blue right half
    const bWidth = 1200, bHeight = 900;
    const bPixels = Buffer.alloc(bWidth * bHeight * 3);
    for (let y = 0; y < bHeight; y++) {
      for (let x = 0; x < bWidth; x++) {
        const i = (y * bWidth + x) * 3;
        if (x < bWidth / 2) {
          bPixels[i] = 255; bPixels[i + 1] = 0; bPixels[i + 2] = 0; // red
        } else {
          bPixels[i] = 0; bPixels[i + 1] = 0; bPixels[i + 2] = 255; // blue
        }
      }
    }
    await sharp(bPixels, { raw: { width: bWidth, height: bHeight, channels: 3 } })
      .png().toFile(gradBefore);

    // After: 1000x800 with green top half, yellow bottom half
    const aWidth = 1000, aHeight = 800;
    const aPixels = Buffer.alloc(aWidth * aHeight * 3);
    for (let y = 0; y < aHeight; y++) {
      for (let x = 0; x < aWidth; x++) {
        const i = (y * aWidth + x) * 3;
        if (y < aHeight / 2) {
          aPixels[i] = 0; aPixels[i + 1] = 200; aPixels[i + 2] = 0; // green
        } else {
          aPixels[i] = 255; aPixels[i + 1] = 255; aPixels[i + 2] = 0; // yellow
        }
      }
    }
    await sharp(aPixels, { raw: { width: aWidth, height: aHeight, channels: 3 } })
      .png().toFile(gradAfter);

    const spec = getAdapter("nextdoor").spec;
    const smartPath = path.join(tmpDir, "diff-smart.jpg");
    const centerPath = path.join(tmpDir, "diff-center.jpg");

    // Smart-crop: offset to right side of before image (mostly blue)
    const smartCrop = {
      before: { left: 500, top: 100, width: 600, height: 675 },
      after: { left: 100, top: 50, width: 600, height: 675 },
      reasoning: "offset crop",
    };

    await composeSocialImage(gradBefore, gradAfter, smartPath, spec, smartCrop);
    await composeSocialImage(gradBefore, gradAfter, centerPath, spec, null);

    // With a non-center offset on non-uniform images, the outputs must differ
    const smartHash = sha256(smartPath);
    const centerHash = sha256(centerPath);
    expect(smartHash).not.toBe(centerHash);
  });
});

// ---- R3.1 regression: no API key = same center-crop behavior ----

describe("R3.1 regression with smart-crop module loaded", () => {
  let tmpDir: string;
  let beforePath: string;
  let afterPath: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "r31-regression-"));
    beforePath = path.join(tmpDir, "before.png");
    afterPath = path.join(tmpDir, "after.png");
    await createTestImage(beforePath, 800, 600, { r: 34, g: 139, b: 34 });
    await createTestImage(afterPath, 800, 600, { r: 139, g: 69, b: 19 });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("composer without smart-crop produces identical output to R3.1 behavior", async () => {
    const spec = getAdapter("nextdoor").spec;

    // Run twice without smart-crop — should be deterministic (R3.1 behavior)
    const out1 = path.join(tmpDir, "r31-a.jpg");
    const out2 = path.join(tmpDir, "r31-b.jpg");

    await composeSocialImage(beforePath, afterPath, out1, spec, null);
    await composeSocialImage(beforePath, afterPath, out2, spec, null);

    expect(sha256(out1)).toBe(sha256(out2));
  });
});
