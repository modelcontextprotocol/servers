import { z } from "zod";
import { githubRequest } from "../common/utils";
import { GitHubPullRequestSchema } from "../common/types";

// Schema definitions
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