import { z } from "zod";
import { githubRequest, buildUrl } from "../common/utils.js";
import { GitHubCommitComparisonSchema } from "../common/types.js";

export const CompareRefsOptionsSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("The name of the repository"),
  base: z.string().describe("The base ref(local branch, forked branch, tag, commit, etc)"),
  head: z.string().describe("The head ref(local branch, forked branch, tag, commit, etc)"),
  page: z.number().optional(),
  perPage: z.number().optional()
});

export async function compareRefs(
  owner: string,
  repo: string,
  options: Omit<z.infer<typeof CompareRefsOptionsSchema>, "owner" | "repo">,
): Promise<z.infer<typeof GitHubCommitComparisonSchema>[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/compare/${options.base}...${options.head}`;

  const urlParams: Record<string, string | undefined> = {
    page: options.page?.toString(),
    per_page: options.per_page?.toString(),
  };

  const response = await githubRequest(buildUrl(url, urlParams));

  return GitHubCommitComparisonSchema.parse(response);
}
