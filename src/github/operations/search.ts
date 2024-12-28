import { z } from "zod";
import { githubRequest, buildUrl } from "../common/utils.js";

// Schema definitions
export const SearchCodeSchema = z.object({
  q: z.string().describe("Search query. See GitHub code search syntax: https://docs.github.com/en/search-github/searching-on-github/searching-code"),
  order: z.enum(["asc", "desc"]).optional().describe("Sort order (asc or desc)"),
  per_page: z.number().min(1).max(100).optional().describe("Results per page (max 100)"),
  page: z.number().min(1).optional().describe("Page number"),
});

export const SearchIssuesSchema = z.object({
  q: z.string().describe("Search query. See GitHub issues search syntax: https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests"),
  sort: z.enum([
    "comments",
    "reactions",
    "reactions-+1",
    "reactions--1",
    "reactions-smile",
    "reactions-thinking_face",
    "reactions-heart",
    "reactions-tada",
    "interactions",
    "created",
    "updated",
  ]).optional().describe("Sort field"),
  order: z.enum(["asc", "desc"]).optional().describe("Sort order (asc or desc)"),
  per_page: z.number().min(1).max(100).optional().describe("Results per page (max 100)"),
  page: z.number().min(1).optional().describe("Page number"),
});

export const SearchUsersSchema = z.object({
  q: z.string().describe("Search query. See GitHub users search syntax: https://docs.github.com/en/search-github/searching-on-github/searching-users"),
  sort: z.enum(["followers", "repositories", "joined"]).optional().describe("Sort field"),
  order: z.enum(["asc", "desc"]).optional().describe("Sort order (asc or desc)"),
  per_page: z.number().min(1).max(100).optional().describe("Results per page (max 100)"),
  page: z.number().min(1).optional().describe("Page number"),
});

// Response schemas
export const SearchCodeItemSchema = z.object({
  name: z.string().describe("The name of the file"),
  path: z.string().describe("The path to the file in the repository"),
  sha: z.string().describe("The SHA hash of the file"),
  url: z.string().describe("The API URL for this file"),
  git_url: z.string().describe("The Git URL for this file"),
  html_url: z.string().describe("The HTML URL to view this file on GitHub"),
  repository: z.object({
    full_name: z.string(),
    description: z.string().nullable(),
    url: z.string(),
    html_url: z.string(),
  }).describe("The repository where this file was found"),
  score: z.number().describe("The search result score"),
});

export const SearchCodeResponseSchema = z.object({
  total_count: z.number().describe("Total number of matching results"),
  incomplete_results: z.boolean().describe("Whether the results are incomplete"),
  items: z.array(SearchCodeItemSchema).describe("The search results"),
});

export const SearchUsersResponseSchema = z.object({
  total_count: z.number().describe("Total number of matching results"),
  incomplete_results: z.boolean().describe("Whether the results are incomplete"),
  items: z.array(z.object({
    login: z.string().describe("The username of the user"),
    id: z.number().describe("The ID of the user"),
    node_id: z.string().describe("The Node ID of the user"),
    avatar_url: z.string().describe("The avatar URL of the user"),
    gravatar_id: z.string().describe("The Gravatar ID of the user"),
    url: z.string().describe("The API URL for this user"),
    html_url: z.string().describe("The HTML URL to view this user on GitHub"),
    type: z.string().describe("The type of this user"),
    site_admin: z.boolean().describe("Whether this user is a site administrator"),
    score: z.number().describe("The search result score"),
  })).describe("The search results"),
});

// Type exports
export type SearchCodeParams = z.infer<typeof SearchCodeSchema>;
export type SearchIssuesParams = z.infer<typeof SearchIssuesSchema>;
export type SearchUsersParams = z.infer<typeof SearchUsersSchema>;
export type SearchCodeResponse = z.infer<typeof SearchCodeResponseSchema>;
export type SearchUsersResponse = z.infer<typeof SearchUsersResponseSchema>;

// Function implementations
export async function searchCode(params: SearchCodeParams): Promise<SearchCodeResponse> {
  const url = buildUrl("https://api.github.com/search/code", params);
  const response = await githubRequest(url);
  return SearchCodeResponseSchema.parse(response);
}

export async function searchIssues(params: SearchIssuesParams) {
  const url = buildUrl("https://api.github.com/search/issues", params);
  const response = await githubRequest(url);
  return response;
}

export async function searchUsers(params: SearchUsersParams): Promise<SearchUsersResponse> {
  const url = buildUrl("https://api.github.com/search/users", params);
  const response = await githubRequest(url);
  return SearchUsersResponseSchema.parse(response);
}
