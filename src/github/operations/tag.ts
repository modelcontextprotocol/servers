import { z } from "zod";
import { githubRequest, buildUrl } from "../common/utils.js";
import { GitHubTagSchema } from "../common/types.js";

export const ListTagsOptionsSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("The name of the repository"),
  per_page: z.number().optional().describe("Results per page (max 100)"),
  page: z.number().optional().describe("Page number of the results")
});

export async function listTags(
  owner: string,
  repo: string,
  options: Omit<z.infer<typeof ListTagsOptionsSchema>, 'owner' | 'repo'>
): Promise<z.infer<typeof GitHubTagSchema>[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/tags`;

  const urlParams: Record<string, string | undefined> = {
    page: options.page?.toString(),
    per_page: options.per_page?.toString(),
  };

  const response = await githubRequest(
    buildUrl(url, urlParams)
  );

  return z.array(GitHubTagSchema).parse(response);
}
