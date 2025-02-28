import { z } from "zod";
import { githubRequest, buildUrl } from "../common/utils.js";
import { GITHUB_API_URL } from "../common/config.js";

export const ListCommitsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  sha: z.string().optional(),
  page: z.number().optional(),
  perPage: z.number().optional()
});

export async function listCommits(
  owner: string,
  repo: string,
  page?: number,
  perPage?: number,
  sha?: string
) {
  return githubRequest(
    buildUrl(`${GITHUB_API_URL}/repos/${owner}/${repo}/commits`, {
      page: page?.toString(),
      per_page: perPage?.toString(),
      sha
    })
  );
}