import { describe, expect, it } from "vitest";
import { validateDeclarationManifest } from "../server/declaration-manifest.js";

const knownDeclarations = {
  tools: new Set<string>(["echo", "get-sum"]),
  resources: new Set<string>(["resource-templates"]),
  prompts: new Set<string>(["simple-prompt"]),
};

describe("declaration manifest validation", () => {
  it("accepts valid declaration manifest", () => {
    expect(
      validateDeclarationManifest(
        JSON.stringify({
          tools: ["echo"],
          resources: ["resource-templates"],
          prompts: ["simple-prompt"],
        }),
        knownDeclarations
      )
    ).toBeTruthy();
  });

  it("fails on unknown declaration section", () => {
    expect(() =>
      validateDeclarationManifest(
        JSON.stringify({ unknown: ["value"] }),
        knownDeclarations
      )
    ).toThrow("manifest.unknown: unknown declaration section");
  });

  it("fails on unknown tool/resource/prompt declaration names", () => {
    expect(() =>
      validateDeclarationManifest(
        JSON.stringify({
          tools: ["unknown-tool"],
          resources: ["unknown-resource"],
          prompts: ["unknown-prompt"],
        }),
        knownDeclarations
      )
    ).toThrow("Declaration manifest validation failed");
  });
});
