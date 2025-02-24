export class GiteeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GiteeError";
  }
}

export class GiteeValidationError extends GiteeError {
  response?: unknown;

  constructor(message: string, response?: unknown) {
    super(message);
    this.name = "GiteeValidationError";
    this.response = response;
  }
}

export class GiteeResourceNotFoundError extends GiteeError {
  constructor(message: string) {
    super(message);
    this.name = "GiteeResourceNotFoundError";
  }
}

export class GiteeAuthenticationError extends GiteeError {
  constructor(message: string) {
    super(message);
    this.name = "GiteeAuthenticationError";
  }
}

export class GiteePermissionError extends GiteeError {
  constructor(message: string) {
    super(message);
    this.name = "GiteePermissionError";
  }
}

export class GiteeRateLimitError extends GiteeError {
  resetAt: Date;

  constructor(message: string, resetAt: Date) {
    super(message);
    this.name = "GiteeRateLimitError";
    this.resetAt = resetAt;
  }
}

export class GiteeConflictError extends GiteeError {
  constructor(message: string) {
    super(message);
    this.name = "GiteeConflictError";
  }
}

export function isGiteeError(error: unknown): error is GiteeError {
  return error instanceof GiteeError;
}

export function createGiteeError(status: number, responseBody: unknown): GiteeError {
  let message = "Gitee API request failed";
  let resetAt: Date | undefined;

  if (typeof responseBody === "object" && responseBody !== null) {
    const body = responseBody as Record<string, unknown>;

    if (body.message && typeof body.message === "string") {
      message = body.message;
    }

    if (body.documentation_url && typeof body.documentation_url === "string") {
      message += ` - Documentation: ${body.documentation_url}`;
    }
  }

  switch (status) {
    case 400:
      return new GiteeValidationError(message, responseBody);
    case 401:
      return new GiteeAuthenticationError(message);
    case 403:
      return new GiteePermissionError(message);
    case 404:
      return new GiteeResourceNotFoundError(message);
    case 409:
      return new GiteeConflictError(message);
    case 429:
      return new GiteeRateLimitError(
        message,
        resetAt || new Date(Date.now() + 60 * 1000) // Default: reset after 1 minute
      );
    default:
      return new GiteeError(message);
  }
}
