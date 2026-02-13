import { describe, it, expect } from "vitest";
import { parseServiceText } from "../../src/bot/services/textParser";

describe("parseServiceText", () => {
  it("recognizes 'tree removal' prefix", () => {
    const result = parseServiceText("Tree removal big oak in backyard");
    expect(result.service).toBe("tree removal");
    expect(result.notes).toBe("Tree removal big oak in backyard");
  });

  it("recognizes 'stump grinding' prefix", () => {
    const result = parseServiceText("stump grinding near the driveway");
    expect(result.service).toBe("stump grinding");
  });

  it("recognizes 'hedge trim' prefix", () => {
    const result = parseServiceText("Hedge trim along the fence");
    expect(result.service).toBe("hedge trim");
  });

  it("recognizes 'brush clearing' prefix", () => {
    const result = parseServiceText("brush clearing lot next to church");
    expect(result.service).toBe("brush clearing");
  });

  it("defaults to 'tree trim' for unrecognized text", () => {
    const result = parseServiceText("just some random text about the job");
    expect(result.service).toBe("tree trim");
    expect(result.notes).toBe("just some random text about the job");
  });

  it("is case-insensitive", () => {
    const result = parseServiceText("TREE REMOVAL big one");
    expect(result.service).toBe("tree removal");
  });

  it("trims whitespace", () => {
    const result = parseServiceText("  tree trim   nice yard  ");
    expect(result.service).toBe("tree trim");
    expect(result.notes).toBe("tree trim   nice yard");
  });

  it("handles single keyword with no additional text", () => {
    const result = parseServiceText("lot clearing");
    expect(result.service).toBe("lot clearing");
    expect(result.notes).toBe("lot clearing");
  });
});
