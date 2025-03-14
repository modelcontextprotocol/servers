/**
 * Utility functions for GitHub Projects API interactions
 */
import fetch from 'node-fetch';
import { getUserAgent } from 'universal-user-agent';
import { createGitHubError } from './errors.js';

export const USER_AGENT = getUserAgent();

/**
 * Makes a GraphQL request to the GitHub API
 * 
 * @param query The GraphQL query or mutation
 * @param variables Optional variables for the GraphQL query
 * @returns The response data from the GraphQL API
 */
export async function graphqlRequest(
  query: string,
  variables?: Record<string, any>
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v4+json",
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    "X-Github-Next-Global-ID": "1" // Required for Projects V2
  };

  if (process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`;
  }

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({
      query,
      variables
    }),
  });

  const responseBody = await response.json() as any;

  if (!response.ok || responseBody.errors) {
    throw createGitHubError(
      response.status,
      responseBody.errors?.[0] || { message: "GraphQL request failed" }
    );
  }

  return responseBody.data;
}

/**
 * Escapes a string for use in a GraphQL query
 * 
 * @param str The string to escape
 * @returns The escaped string
 */
export function escapeGraphQLString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
} 