/**
 * Types and utilities for handling GitHub API errors
 */

export interface GitHubError {
  status: number;
  message: string;
  errors?: any[];
  documentation_url?: string;
}

export function isGitHubError(error: unknown): error is GitHubError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    'message' in error
  );
}

export function createGitHubError(
  status: number,
  response: { message: string; errors?: any[]; documentation_url?: string }
): GitHubError {
  return {
    status,
    message: response.message,
    errors: response.errors,
    documentation_url: response.documentation_url,
  };
}

export function formatGitHubError(error: GitHubError): string {
  let message = `GitHub API Error (${error.status}): ${error.message}`;

  if (error.errors?.length) {
    message += `\nDetails: ${JSON.stringify(error.errors)}`;
  }

  if (error.documentation_url) {
    message += `\nDocumentation: ${error.documentation_url}`;
  }

  return message;
} 