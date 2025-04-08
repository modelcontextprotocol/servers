import { z } from "zod";
import { githubRequest, buildUrl } from "../common/utils.js";
import { GitHubRepositorySchema, GitHubSearchResponseSchema, GitHubLabelSchema } from "../common/types.js";

// Schema definitions
export const CreateRepositoryOptionsSchema = z.object({
  name: z.string().describe("Repository name"),
  description: z.string().optional().describe("Repository description"),
  private: z.boolean().optional().describe("Whether the repository should be private"),
  autoInit: z.boolean().optional().describe("Initialize with README.md"),
});

export const SearchRepositoriesSchema = z.object({
  query: z.string().describe("Search query (see GitHub search syntax)"),
  page: z.number().optional().describe("Page number for pagination (default: 1)"),
  perPage: z.number().optional().describe("Number of results per page (default: 30, max: 100)"),
});

export const ForkRepositorySchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  organization: z.string().optional().describe("Optional: organization to fork to (defaults to your personal account)"),
});

export const ListRepositoryLabelsSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  page: z.number().optional().describe("Page number for pagination (default: 1)"),
  perPage: z.number().optional().describe("Number of results per page (default: 30, max: 100)"),
});

// Type exports
export type CreateRepositoryOptions = z.infer<typeof CreateRepositoryOptionsSchema>;

// Function implementations
export async function createRepository(options: CreateRepositoryOptions) {
  const response = await githubRequest("https://api.github.com/user/repos", {
    method: "POST",
    body: options,
  });
  return GitHubRepositorySchema.parse(response);
}

export async function searchRepositories(
  query: string,
  page: number = 1,
  perPage: number = 30
) {
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.append("q", query);
  url.searchParams.append("page", page.toString());
  url.searchParams.append("per_page", perPage.toString());

  const response = await githubRequest(url.toString());
  return GitHubSearchResponseSchema.parse(response);
}

export async function forkRepository(
  owner: string,
  repo: string,
  organization?: string
) {
  const url = organization
    ? `https://api.github.com/repos/${owner}/${repo}/forks?organization=${organization}`
    : `https://api.github.com/repos/${owner}/${repo}/forks`;

  const response = await githubRequest(url, { method: "POST" });
  return GitHubRepositorySchema.extend({
    parent: GitHubRepositorySchema,
    source: GitHubRepositorySchema,
  }).parse(response);
}

export async function listRepositoryLabels(
  owner: string,
  repo: string,
  options: Omit<z.infer<typeof ListRepositoryLabelsSchema>, "owner" | "repo"> = {}
) {
  const urlParams: Record<string, string | undefined> = {
    page: options.page?.toString(),
    per_page: options.perPage?.toString(),
  };

  const response = await githubRequest(
    buildUrl(`https://api.github.com/repos/${owner}/${repo}/labels`, urlParams)
  );
  
  return z.array(GitHubLabelSchema).parse(response);
}
