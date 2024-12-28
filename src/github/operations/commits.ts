import { z } from "zod";
import { githubRequest, buildUrl } from "../common/utils.js";
import { GitHubCommitSchema, GitHubListCommitsSchema } from "../common/types.js";

// Schema definitions
export const ListCommitsSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  page: z.number().optional().describe("Page number for pagination (default: 1)"),
  perPage: z.number().optional().describe("Number of results per page (default: 30, max: 100)"),
  sha: z.string().optional().describe("SHA of the commit to start listing from"),
});

// Type exports
export type ListCommitsParams = z.infer<typeof ListCommitsSchema>;

// Function implementations
export async function listCommits(
  owner: string,
  repo: string,
  page: number = 1,
  perPage: number = 30,
  sha?: string
) {
  const params = {
    page,
    per_page: perPage,
    ...(sha ? { sha } : {})
  };

  const url = buildUrl(`https://api.github.com/repos/${owner}/${repo}/commits`, params);

  const response = await githubRequest(url);
  return GitHubListCommitsSchema.parse(response);
}

export async function getCommit(
  owner: string,
  repo: string,
  sha: string
) {
  const response = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/git/commits/${sha}`
  );

  return GitHubCommitSchema.parse(response);
}

export async function createCommit(
  owner: string,
  repo: string,
  message: string,
  tree: string,
  parents: string[]
) {
  const response = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/git/commits`,
    {
      method: "POST",
      body: {
        message,
        tree,
        parents,
      },
    }
  );

  return GitHubCommitSchema.parse(response);
}

export async function compareCommits(
  owner: string,
  repo: string,
  base: string,
  head: string
) {
  const response = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`
  );

  return z.object({
    url: z.string(),
    html_url: z.string(),
    permalink_url: z.string(),
    diff_url: z.string(),
    patch_url: z.string(),
    base_commit: GitHubCommitSchema,
    merge_base_commit: GitHubCommitSchema,
    commits: z.array(GitHubCommitSchema),
    total_commits: z.number(),
    status: z.string(),
    ahead_by: z.number(),
    behind_by: z.number(),
  }).parse(response);
}
