export class ResendError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly response: unknown
  ) {
    super(message);
    this.name = "ResendError";
  }
}

export class ResendValidationError extends ResendError {
  constructor(message: string, status: number, response: unknown) {
    super(message, status, response);
    this.name = "ResendValidationError";
  }
}

export class ResendAuthenticationError extends ResendError {
  constructor(message = "Authentication failed") {
    super(message, 401, { message });
    this.name = "ResendAuthenticationError";
  }
}

export class ResendRateLimitError extends ResendError {
  constructor(
    message = "Rate limit exceeded",
    public readonly resetAt: Date
  ) {
    super(message, 429, { message, reset_at: resetAt.toISOString() });
    this.name = "ResendRateLimitError";
  }
}

export function isResendError(error: unknown): error is ResendError {
  return error instanceof ResendError;
}

export function createResendError(status: number, response: any): ResendError {
  switch (status) {
    case 401:
      return new ResendAuthenticationError(response?.message);
    case 422:
      return new ResendValidationError(
        response?.message || "Validation failed",
        status,
        response
      );
    case 429:
      return new ResendRateLimitError(
        response?.message,
        new Date(response?.reset_at || Date.now() + 60000)
      );
    default:
      return new ResendError(
        response?.message || "Resend API error",
        status,
        response
      );
  }
} 