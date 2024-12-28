import { z } from "zod";
import { githubRequest } from "../common/utils.js";
import { 
  GitHubIssueAssigneeSchema, 
  GitHubRepositorySchema 
} from "../common/types.js";

// Schema definitions
export const GitHubPullRequestHeadSchema = z.object({
  label: z.string(),
  ref: z.string(),
  sha: z.string(),
  user: GitHubIssueAssigneeSchema,
  repo: GitHubRepositorySchema,
});

export const GitHubPullRequestSchema = z.object({
  url: z.string(),
  id: z.number(),
  node_id: z.string(),
  html_url: z.string(),
  diff_url: z.string(),
  patch_url: z.string(),
  issue_url: z.string(),
  number: z.number(),
  state: z.string(),
  locked: z.boolean(),
  title: z.string(),
  user: GitHubIssueAssigneeSchema,
  body: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  merged_at: z.string().nullable(),
  merge_commit_sha: z.string().nullable(),
  assignee: GitHubIssueAssigneeSchema.nullable(),
  assignees: z.array(GitHubIssueAssigneeSchema),
  head: GitHubPullRequestHeadSchema,
  base: GitHubPullRequestHeadSchema,
});

export const CreatePullRequestOptionsSchema = z.object({
  title: z.string().describe("Pull request title"),
  body: z.string().optional().describe("Pull request body/description"),
  head: z.string().describe("The name of the branch where your changes are implemented"),
  base: z.string().describe("The name of the branch you want the changes pulled into"),
  maintainer_can_modify: z.boolean().optional().describe("Whether maintainers can modify the pull request"),
  draft: z.boolean().optional().describe("Whether to create the pull request as a draft"),
});

export const CreatePullRequestSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  title: z.string().describe("Pull request title"),
  body: z.string().optional().describe("Pull request body/description"),
  head: z.string().describe("The name of the branch where your changes are implemented"),
  base: z.string().describe("The name of the branch you want the changes pulled into"),
  draft: z.boolean().optional().describe("Whether to create the pull request as a draft"),
  maintainer_can_modify: z.boolean().optional().describe("Whether maintainers can modify the pull request"),
});

// Type exports
export type CreatePullRequestOptions = z.infer<typeof CreatePullRequestOptionsSchema>;
export type GitHubPullRequest = z.infer<typeof GitHubPullRequestSchema>;
export type GitHubPullRequestHead = z.infer<typeof GitHubPullRequestHeadSchema>;

// Function implementations
export async function createPullRequest(
  owner: string,
  repo: string,
  options: CreatePullRequestOptions
): Promise<z.infer<typeof GitHubPullRequestSchema>> {
  const response = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      body: options,
    }
  );

  return GitHubPullRequestSchema.parse(response);
}

export async function getPullRequest(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<z.infer<typeof GitHubPullRequestSchema>> {
  const response = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`
  );

  return GitHubPullRequestSchema.parse(response);
}

export async function listPullRequests(
  owner: string,
  repo: string,
  options: {
    state?: "open" | "closed" | "all";
    head?: string;
    base?: string;
    sort?: "created" | "updated" | "popularity" | "long-running";
    direction?: "asc" | "desc";
    per_page?: number;
    page?: number;
  } = {}
): Promise<z.infer<typeof GitHubPullRequestSchema>[]> {
  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/pulls`);
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.append(key, value.toString());
    }
  });

  const response = await githubRequest(url.toString());
  return z.array(GitHubPullRequestSchema).parse(response);
}
