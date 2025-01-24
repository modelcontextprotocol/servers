import { z } from "zod";
import { buildUrl, githubRequest } from "../common/utils.js";
import { GitHubReleaseSchema } from "../common/types.js";

// Schema definitions
export const ListReleasesOptionsSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  page: z.number().optional().describe("Page number for pagination (default: 1)"),
  perPage: z.number().optional().describe("Number of results per page (default: 30, max: 100)"),
});

export type ListReleasesOptions = z.infer<typeof ListReleasesOptionsSchema>;

// Function implementations
export async function listReleases({
  owner,
  repo,
  page = 1,
  perPage = 30,
}: ListReleasesOptions) {
  const url = buildUrl(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    page: page.toString(),
    per_page: perPage.toString(),
  });

  const response = await githubRequest(url);
  return z.array(GitHubReleaseSchema).parse(response);
}