import { z } from "zod";
import { githubRequest, buildUrl } from "../common/utils.js";


export const GetReleaseSchema = z.object({
    owner: z.string().describe("Repository owner (username or organization)"),
    repo: z.string().describe("The name of the repository")
});

export const ListReleasesOptionsSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("The name of the repository"),
  per_page: z.number().optional().describe("Results per page (max 100)"),
  page: z.number().optional().describe("Page number of the results")
});

export async function listReleases(
  owner: string, 
  repo: string,
  options: Omit<z.infer<typeof ListReleasesOptionsSchema>, "owner" | "repo">
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases`;

  const urlParams: Record<string, string | undefined> = {
    page: options.page?.toString(),
    per_page: options.per_page?.toString(),
  };

  return githubRequest(
    buildUrl(url, urlParams)
  );
}


export async function getLatestRelease(
  owner: string, 
  repo: string ) {
  return githubRequest(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
}
