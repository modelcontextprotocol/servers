import { z } from "zod";
import { githubRequest } from "../common/utils.js";
import { 
  GitHubIssueAssigneeSchema, 
  GitHubRepositorySchema 
} from "../common/types.js";

// Constants for GitHub limits and constraints
const GITHUB_TITLE_MAX_LENGTH = 256;
const GITHUB_BODY_MAX_LENGTH = 65536;

// Base schema for repository identification
export const RepositoryParamsSchema = z.object({
  owner: z.string().min(1).describe("Repository owner (username or organization)"),
  repo: z.string().min(1).describe("Repository name"),
});

// Common validation schemas
export const GitHubPullRequestStateSchema = z.enum([
  "open",
  "closed",
  "merged",
  "draft"
]).describe("The current state of the pull request");

export const GitHubPullRequestSortSchema = z.enum([
  "created",
  "updated",
  "popularity",
  "long-running"
]).describe("The sorting field for pull requests");

export const GitHubDirectionSchema = z.enum([
  "asc",
  "desc"
]).describe("The sort direction");

// Pull request head/base schema
export const GitHubPullRequestRefSchema = z.object({
  label: z.string(),
  ref: z.string().min(1),
  sha: z.string().length(40),
  user: GitHubIssueAssigneeSchema,
  repo: GitHubRepositorySchema,
}).describe("Reference information for pull request head or base");

// Main pull request schema
export const GitHubPullRequestSchema = z.object({
  url: z.string().url(),
  id: z.number().positive(),
  node_id: z.string(),
  html_url: z.string().url(),
  diff_url: z.string().url(),
  patch_url: z.string().url(),
  issue_url: z.string().url(),
  number: z.number().positive(),
  state: GitHubPullRequestStateSchema,
  locked: z.boolean(),
  title: z.string().max(GITHUB_TITLE_MAX_LENGTH),
  user: GitHubIssueAssigneeSchema,
  body: z.string().max(GITHUB_BODY_MAX_LENGTH).nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  closed_at: z.string().datetime().nullable(),
  merged_at: z.string().datetime().nullable(),
  merge_commit_sha: z.string().length(40).nullable(),
  assignee: GitHubIssueAssigneeSchema.nullable(),
  assignees: z.array(GitHubIssueAssigneeSchema),
  requested_reviewers: z.array(GitHubIssueAssigneeSchema),
  labels: z.array(z.object({
    name: z.string(),
    color: z.string().regex(/^[0-9a-fA-F]{6}$/),
    description: z.string().nullable(),
  })),
  head: GitHubPullRequestRefSchema,
  base: GitHubPullRequestRefSchema,
});

// Request schemas
export const ListPullRequestsOptionsSchema = z.object({
  state: GitHubPullRequestStateSchema.optional(),
  head: z.string().optional(),
  base: z.string().optional(),
  sort: GitHubPullRequestSortSchema.optional(),
  direction: GitHubDirectionSchema.optional(),
  per_page: z.number().min(1).max(100).optional(),
  page: z.number().min(1).optional(),
}).describe("Options for listing pull requests");

export const CreatePullRequestOptionsSchema = z.object({
  title: z.string().max(GITHUB_TITLE_MAX_LENGTH).describe("Pull request title"),
  body: z.string().max(GITHUB_BODY_MAX_LENGTH).optional().describe("Pull request body/description"),
  head: z.string().min(1).describe("The name of the branch where your changes are implemented"),
  base: z.string().min(1).describe("The name of the branch you want the changes pulled into"),
  maintainer_can_modify: z.boolean().optional().describe("Whether maintainers can modify the pull request"),
  draft: z.boolean().optional().describe("Whether to create the pull request as a draft"),
}).describe("Options for creating a pull request");

// Combine repository params with operation options
export const CreatePullRequestSchema = RepositoryParamsSchema.extend({
  ...CreatePullRequestOptionsSchema.shape,
});

// Type exports
export type RepositoryParams = z.infer<typeof RepositoryParamsSchema>;
export type CreatePullRequestOptions = z.infer<typeof CreatePullRequestOptionsSchema>;
export type ListPullRequestsOptions = z.infer<typeof ListPullRequestsOptionsSchema>;
export type GitHubPullRequest = z.infer<typeof GitHubPullRequestSchema>;
export type GitHubPullRequestRef = z.infer<typeof GitHubPullRequestRefSchema>;

/**
 * Creates a new pull request in a repository.
 * 
 * @param params Repository identification and pull request creation options
 * @returns Promise resolving to the created pull request
 * @throws {ZodError} If the input parameters fail validation
 * @throws {Error} If the GitHub API request fails
 */
export async function createPullRequest(
  params: z.infer<typeof CreatePullRequestSchema>
): Promise<GitHubPullRequest> {
  const { owner, repo, ...options } = CreatePullRequestSchema.parse(params);
  
  const response = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      body: options,
    }
  );

  return GitHubPullRequestSchema.parse(response);
}

/**
 * Retrieves a specific pull request by its number.
 * 
 * @param params Repository parameters and pull request number
 * @returns Promise resolving to the pull request details
 * @throws {Error} If the pull request is not found or the request fails
 */
export async function getPullRequest(
  params: RepositoryParams & { pullNumber: number }
): Promise<GitHubPullRequest> {
  const { owner, repo, pullNumber } = z.object({
    ...RepositoryParamsSchema.shape,
    pullNumber: z.number().positive(),
  }).parse(params);

  const response = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`
  );

  return GitHubPullRequestSchema.parse(response);
}

/**
 * Lists pull requests in a repository with optional filtering.
 * 
 * @param params Repository parameters and listing options
 * @returns Promise resolving to an array of pull requests
 * @throws {ZodError} If the input parameters fail validation
 * @throws {Error} If the GitHub API request fails
 */
export async function listPullRequests(
  params: RepositoryParams & Partial<ListPullRequestsOptions>
): Promise<GitHubPullRequest[]> {
  const { owner, repo, ...options } = z.object({
    ...RepositoryParamsSchema.shape,
    ...ListPullRequestsOptionsSchema.partial().shape,
  }).parse(params);

  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/pulls`);
  
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.append(key, value.toString());
    }
  });

  const response = await githubRequest(url.toString());
  return z.array(GitHubPullRequestSchema).parse(response);
}
