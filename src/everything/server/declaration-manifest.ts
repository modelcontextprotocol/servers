type DeclarationSection = "tools" | "resources" | "prompts";

export type DeclarationManifest = Partial<Record<DeclarationSection, string[]>>;

const DECLARATION_SECTIONS: DeclarationSection[] = [
  "tools",
  "resources",
  "prompts",
];

export function validateDeclarationManifest(
  manifestRaw: string | undefined,
  knownDeclarations: Record<DeclarationSection, ReadonlySet<string>>
): DeclarationManifest | null {
  if (!manifestRaw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestRaw);
  } catch (error) {
    throw new Error(
      `Invalid declaration manifest JSON: ${(error as Error).message}`
    );
  }

  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Declaration manifest must be a JSON object.");
  }

  const manifest = parsed as Record<string, unknown>;
  const errors: string[] = [];

  for (const key of Object.keys(manifest)) {
    if (!DECLARATION_SECTIONS.includes(key as DeclarationSection)) {
      errors.push(`manifest.${key}: unknown declaration section`);
    }
  }

  for (const section of DECLARATION_SECTIONS) {
    const value = manifest[section];
    if (value === undefined) {
      continue;
    }

    if (!Array.isArray(value)) {
      errors.push(`manifest.${section}: expected an array of strings`);
      continue;
    }

    value.forEach((entry, index) => {
      if (typeof entry !== "string") {
        errors.push(
          `manifest.${section}[${index}]: expected string declaration name`
        );
        return;
      }
      if (!knownDeclarations[section].has(entry)) {
        errors.push(
          `manifest.${section}[${index}]: unknown declaration '${entry}'`
        );
      }
    });
  }

  if (errors.length > 0) {
    throw new Error(
      `Declaration manifest validation failed:\n${errors.join("\n")}`
    );
  }

  return manifest as DeclarationManifest;
}
