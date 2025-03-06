import { getUserAgent } from "universal-user-agent";
import { createGiteeError } from "./errors.js";
import { VERSION } from "./version.js";

// Default Gitee API base URL
const DEFAULT_GITEE_API_BASE_URL = "https://gitee.com/api/v5";

/**
 * Get the Gitee API base URL from environment variables or use the default
 * @returns The Gitee API base URL
 */
export function getGiteeApiBaseUrl(): string {
  return process.env.GITEE_API_BASE_URL || DEFAULT_GITEE_API_BASE_URL;
}

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

const USER_AGENT = `modelcontextprotocol/servers/gitee/v${VERSION} ${getUserAgent()}`;

// Generate the equivalent curl command for debugging.
function generateCurlCommand(url: string, method: string, headers: Record<string, string>, body?: unknown): string {
  let curl = `curl -X ${method} "${url}"`;

  // Add request headers
  Object.entries(headers).forEach(([key, value]) => {
    curl += ` -H "${key}: ${value}"`;
  });

  // Add request body
  if (body) {
    curl += ` -d '${JSON.stringify(body)}'`;
  }

  return curl;
}

// debug utility function
export function debug(message: string, data?: unknown): void {
  if (data !== undefined) {
    console.error(`[DEBUG] ${message}`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
  } else {
    console.error(`[DEBUG] ${message}`);
  }
}

export async function giteeRequest(
  urlPath: string,
  method: string = "GET",
  body?: unknown,
  headers?: Record<string, string>
): Promise<unknown> {
  // Check if the URL is already a full URL or a path
  const url = urlPath.startsWith("http") ? urlPath : `${getGiteeApiBaseUrl()}${urlPath.startsWith("/") ? urlPath : `/${urlPath}`}`;
  const requestHeaders: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    ...headers,
  };

  if (process.env.GITEE_PERSONAL_ACCESS_TOKEN) {
    // The Gitee API uses `access_token` as a query parameter or in the `Authorization` header.
    // Method 1: Add to URL Query Parameters
    const urlObj = new URL(url);
    urlObj.searchParams.append('access_token', process.env.GITEE_PERSONAL_ACCESS_TOKEN);
    url = urlObj.toString();

    // Method 2: Add to Request Headers (Two methods are tried to increase success rate)
    requestHeaders["Authorization"] = `token ${process.env.GITEE_PERSONAL_ACCESS_TOKEN}`;

    debug(`Using access token: ${process.env.GITEE_PERSONAL_ACCESS_TOKEN.substring(0, 4)}...`);
  } else {
    debug(`No access token found in environment variables`);
  }

  // Print the request
  debug(`Request: ${method} ${url}`);
  debug(`Headers:`, requestHeaders);
  if (body) {
    debug(`Body:`, body);
  }

  // Print the equivalent curl command
  const curlCommand = generateCurlCommand(url, method, requestHeaders, body);
  debug(`cURL: ${curlCommand}\n`);

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseBody = await parseResponseBody(response);

  // Print the response
  debug(`Response Status: ${response.status} ${response.statusText}`);
  debug(`Response Body:`, responseBody);

  if (!response.ok) {
    throw createGiteeError(response.status, responseBody);
  }

  return responseBody;
}

export function validateBranchName(branch: string): string {
  const sanitized = branch.trim();
  if (!sanitized) {
    throw new Error("分支名不能为空");
  }
  if (sanitized.includes("..")) {
    throw new Error("分支名不能包含 '..'");
  }
  if (/[\s~^:?*[\\\]]/.test(sanitized)) {
    throw new Error("分支名包含无效字符");
  }
  if (sanitized.startsWith("/") || sanitized.endsWith("/")) {
    throw new Error("分支名不能以 '/' 开头或结尾");
  }
  if (sanitized.endsWith(".lock")) {
    throw new Error("分支名不能以 '.lock' 结尾");
  }
  return sanitized;
}

export function validateRepositoryName(name: string): string {
  const sanitized = name.trim();
  if (!sanitized) {
    throw new Error("仓库名不能为空");
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(sanitized)) {
    throw new Error(
      "仓库名只能包含字母、数字、连字符、句点和下划线"
    );
  }
  if (sanitized.startsWith(".") || sanitized.endsWith(".")) {
    throw new Error("仓库名不能以句点开头或结尾");
  }
  return sanitized;
}

export function validateOwnerName(owner: string): string {
  const sanitized = owner.trim();
  if (!sanitized) {
    throw new Error("所有者名称不能为空");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(sanitized)) {
    throw new Error(
      "所有者名称只能包含字母、数字和连字符，且必须以字母或数字开头"
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
    await giteeRequest(`/repos/${owner}/${repo}/branches/${branch}`, "GET");
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "name" in error && error.name === "GiteeResourceNotFoundError") {
      return false;
    }
    throw error;
  }
}

export async function checkUserExists(username: string): Promise<boolean> {
  try {
    await giteeRequest(`/users/${username}`, "GET");
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "name" in error && error.name === "GiteeResourceNotFoundError") {
      return false;
    }
    throw error;
  }
}
