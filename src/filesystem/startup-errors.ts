export type StartupValidationCode =
  | 'argv_path_not_directory'
  | 'argv_path_inaccessible'
  | 'argv_no_accessible_directories'
  | 'root_invalid_or_inaccessible'
  | 'root_not_directory'
  | 'root_validation_error';

export type StartupValidationSource = 'argv' | 'roots';

type StartupValidationEvent = {
  kind: 'filesystem_startup_validation';
  code: StartupValidationCode;
  source: StartupValidationSource;
  message: string;
  path?: string;
  paths?: string[];
};

export function emitStartupValidationEvent(
  event: Omit<StartupValidationEvent, 'kind'>,
): void {
  console.error(
    JSON.stringify({
      kind: 'filesystem_startup_validation',
      ...event,
    }),
  );
}
