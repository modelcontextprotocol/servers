import fetch from "node-fetch";

if (!process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
  console.error("GITHUB_PERSONAL_ACCESS_TOKEN environment variable is not set");
  process.exit(1);
}

export const GITHUB_PERSONAL_ACCESS_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

interface GitHubRequestOptions {
  method?: string;
  body?: any;
}

export async function githubRequest(url: string, options: GitHubRequestOptions = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "github-mcp-server",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return response.json();
}

export function buildUrl(baseUrl: string, params: Record<string, any> = {}) {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        url.searchParams.append(key, value.join(","));
      } else {
        url.searchParams.append(key, value.toString());
      }
    }
  });
  return url.toString();
}