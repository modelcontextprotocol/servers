export type ReadOnlyResolution = {
  isReadOnly: boolean;
  directories: string[];
  helpRequested: boolean;
  warnings: string[];
  error?: string;
};

type BoolParse = { value: boolean | undefined; warning?: string };

const TRUE_VALUES = ["1", "true", "yes"];
const FALSE_VALUES = ["0", "false", "no"];

function parseBoolEnvVar(name: string, env: NodeJS.ProcessEnv): BoolParse {
  const raw = env[name];
  if (raw === undefined) return { value: undefined };
  const normalized = raw.toLowerCase();
  if (TRUE_VALUES.includes(normalized)) return { value: true };
  if (FALSE_VALUES.includes(normalized)) return { value: false };
  return { value: undefined, warning: `Ignoring ${name} because value '${raw}' is not one of ${[...TRUE_VALUES, ...FALSE_VALUES].join(', ')}` };
}

type ParsedArgs = {
  helpRequested: boolean;
  hasReadOnlyFlag: boolean;
  hasWriteEnabledFlag: boolean;
  directories: string[];
};

function parseArgs(args: string[]): ParsedArgs {
  const directories: string[] = [];
  let helpRequested = false;
  let hasReadOnlyFlag = false;
  let hasWriteEnabledFlag = false;
  let parsingFlags = true;

  for (const arg of args) {
    if (parsingFlags) {
      if (arg === "--help" || arg === "-h") {
        helpRequested = true;
        continue;
      }
      if (arg === "--read-only") {
        hasReadOnlyFlag = true;
        continue;
      }
      if (arg === "--write-enabled") {
        hasWriteEnabledFlag = true;
        continue;
      }
      if (arg === "--") {
        parsingFlags = false;
        continue;
      }
    }
    // Either flags are done, or this argument isn't a known flag
    directories.push(arg);
  }

  return { helpRequested, hasReadOnlyFlag, hasWriteEnabledFlag, directories };
}

export function resolveReadOnlyMode(args: string[], env: NodeJS.ProcessEnv): ReadOnlyResolution {
  const { helpRequested, hasReadOnlyFlag, hasWriteEnabledFlag, directories } = parseArgs(args);
  const warnings: string[] = [];

  const readOnlyEnv = parseBoolEnvVar("READ_ONLY", env);
  const defaultReadOnlyEnv = parseBoolEnvVar("DEFAULT_READ_ONLY", env);
  if (readOnlyEnv.warning) warnings.push(readOnlyEnv.warning);
  if (defaultReadOnlyEnv.warning) warnings.push(defaultReadOnlyEnv.warning);

  if (hasReadOnlyFlag && hasWriteEnabledFlag) {
    return {
      isReadOnly: false,
      directories,
      helpRequested,
      warnings,
      error: "Cannot specify both --read-only and --write-enabled"
    };
  }

  const isReadOnly = hasWriteEnabledFlag
    ? false
    : hasReadOnlyFlag
      ? true
      : readOnlyEnv.value !== undefined
        ? readOnlyEnv.value
        : defaultReadOnlyEnv.value ?? false;

  return { isReadOnly, directories, helpRequested, warnings };
}

export function renderUsage(): string {
  return [
    "Usage: mcp-server-filesystem [--read-only|--write-enabled] [--] [allowed-directory] [additional-directories...]",
    "\nModes and precedence (highest wins):",
    "  1. --write-enabled (force writes on)",
    "  2. --read-only (force writes off)",
    "  3. READ_ONLY env (1/true/yes or 0/false/no)",
    "  4. DEFAULT_READ_ONLY env (1/true/yes to default to read-only)",
    "\nFlags:",
    "  --read-only        Disable all write tools",
    "  --write-enabled    Explicitly enable write tools even if defaults say read-only",
    "  --help             Show this message",
    "  --                 Treat all following arguments as directory paths (even if they start with --)",
    "\nEnvironment:",
    "  READ_ONLY          Overrides everything except command-line flags",
    "  DEFAULT_READ_ONLY  Baseline default (read-only) unless overridden",
  ].join('\n');
}
