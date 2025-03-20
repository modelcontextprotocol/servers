import { z } from "zod";
import { githubRequest, buildUrl } from "../common/utils.js";


export const GetLatestReleaseSchema = z.object({
    owner: z.string().describe("Repository owner (username or organization)"),
    repo: z.string().describe("The name of the repository")
});

export const GetReleaseSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("The name of the repository"),
  release_id: z.number().describe("The ID of the release")
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

export async function getRelease(
  owner: string, 
  repo: string,
  release_id: number
) {
  return githubRequest(`https://api.github.com/repos/${owner}/${repo}/releases/${release_id}`);
}
