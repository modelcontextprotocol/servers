import { describe, expect, it } from "vitest";
import { validateDeclarationManifest } from "../declaration-manifest.js";

const knownDeclarations = {
  tools: new Set<string>(["read_text_file", "write_file"]),
  resources: new Set<string>(),
  prompts: new Set<string>(),
};

describe("filesystem declaration manifest validation", () => {
  it("accepts valid tool declarations", () => {
    expect(() =>
      validateDeclarationManifest(
        JSON.stringify({ tools: ["read_text_file"] }),
        knownDeclarations
      )
    ).not.toThrow();
  });

  it("fails on unknown declaration section", () => {
    expect(() =>
      validateDeclarationManifest(
        JSON.stringify({ unknown: ["x"] }),
        knownDeclarations
      )
    ).toThrow("manifest.unknown: unknown declaration section");
  });

  it("fails on unknown declaration name", () => {
    expect(() =>
      validateDeclarationManifest(
        JSON.stringify({ tools: ["not-a-tool"] }),
        knownDeclarations
      )
    ).toThrow("manifest.tools[0]: unknown declaration 'not-a-tool'");
  });
});
