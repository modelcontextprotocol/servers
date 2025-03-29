import { getUserAgent } from "universal-user-agent";
import { createGitHubError } from "./errors.js";
import { VERSION } from "./version.js";

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

export function buildUrl(baseUrl: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.append(key, value.toString());
    }
  });
  return url.toString();
}

const USER_AGENT = `modelcontextprotocol/servers/github/v${VERSION} ${getUserAgent()}`;

// Cache the GitHub token to avoid frequent subprocess calls
let cachedGitHubToken: string | null = null;
let tokenExpiryTime: number = 0;
const TOKEN_CACHE_DURATION = 3600000; // 1 hour in milliseconds

async function getGitHubToken(): Promise<string | null> {
  // Check if we have a valid cached token
  const now = Date.now();
  if (cachedGitHubToken && now < tokenExpiryTime) {
    return cachedGitHubToken;
  }

  // Try to get token from environment variable first
  if (process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
    cachedGitHubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    tokenExpiryTime = now + TOKEN_CACHE_DURATION;
    return cachedGitHubToken;
  }

  // Try to get token from gh CLI
  try {
    const { execSync } = await import('child_process');
    const output = execSync('gh auth token').toString().trim();
    
    if (output) {
      cachedGitHubToken = output;
      tokenExpiryTime = now + TOKEN_CACHE_DURATION;
      return cachedGitHubToken;
    }
  } catch (error) {
    console.error("Failed to get GitHub token from gh CLI:", error);
  }
  
  console.warn(
    "No GitHub authentication found. Please either:\n" +
    "1. Set GITHUB_PERSONAL_ACCESS_TOKEN environment variable, or\n" +
    "2. Authenticate with GitHub CLI using 'gh auth login'"
  );
  
  return null;
}

export async function githubRequest(
  url: string,
  options: RequestOptions = {}
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    ...options.headers,
  };

  // Get token from gh CLI or environment variable
  const token = await getGitHubToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    // For operations requiring authentication, it's better to fail early
    // Public GitHub APIs will still work without a token
    if (
      url.includes('/repos/') && 
      (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH' || options.method === 'DELETE')
    ) {
      throw new Error(
        "GitHub authentication required for this operation. Please either:\n" +
        "1. Set the GITHUB_PERSONAL_ACCESS_TOKEN environment variable, or\n" +
        "2. Authenticate with GitHub CLI using 'gh auth login'"
      );
    }
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    throw createGitHubError(response.status, responseBody);
  }

  return responseBody;
}

export function validateBranchName(branch: string): string {
  const sanitized = branch.trim();
  if (!sanitized) {
    throw new Error("Branch name cannot be empty");
  }
  if (sanitized.includes("..")) {
    throw new Error("Branch name cannot contain '..'");
  }
  if (/[\s~^:?*[\\\]]/.test(sanitized)) {
    throw new Error("Branch name contains invalid characters");
  }
  if (sanitized.startsWith("/") || sanitized.endsWith("/")) {
    throw new Error("Branch name cannot start or end with '/'");
  }
  if (sanitized.endsWith(".lock")) {
    throw new Error("Branch name cannot end with '.lock'");
  }
  return sanitized;
}

export function validateRepositoryName(name: string): string {
  const sanitized = name.trim().toLowerCase();
  if (!sanitized) {
    throw new Error("Repository name cannot be empty");
  }
  if (!/^[a-z0-9_.-]+$/.test(sanitized)) {
    throw new Error(
      "Repository name can only contain lowercase letters, numbers, hyphens, periods, and underscores"
    );
  }
  if (sanitized.startsWith(".") || sanitized.endsWith(".")) {
    throw new Error("Repository name cannot start or end with a period");
  }
  return sanitized;
}

export function validateOwnerName(owner: string): string {
  const sanitized = owner.trim().toLowerCase();
  if (!sanitized) {
    throw new Error("Owner name cannot be empty");
  }
  if (!/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/.test(sanitized)) {
    throw new Error(
      "Owner name must start with a letter or number and can contain up to 39 characters"
    );
  }
  return sanitized;
}

export async function checkBranchExists(
  owner: string,
  repo: string,
  branch: string
): Promise<boolean> {
  try {
    await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`
    );
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 404) {
      return false;
    }
    throw error;
  }
}

export async function checkUserExists(username: string): Promise<boolean> {
  try {
    await githubRequest(`https://api.github.com/users/${username}`);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 404) {
      return false;
    }
    throw error;
  }
}