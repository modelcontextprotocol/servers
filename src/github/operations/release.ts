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

export const GetReleaseByTagSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("The name of the repository"),
  tag: z.string().describe("The tag of the release")
});

export const ListReleasesOptionsSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("The name of the repository"),
  per_page: z.number().optional().describe("Results per page (max 100)"),
  page: z.number().optional().describe("Page number of the results")
});

export const CreateReleaseOptionsSchema = z.object({
  target_commitish: z.string().optional().describe("Specifies the commitish value that determines where the Git tag is created from. Can be any branch or commit SHA."),
  name: z.string().optional().describe("The name of the release"),
  body: z.string().optional().describe("Text describing the contents of the tag"),
  draft: z.boolean().optional().describe("true to create a draft (unpublished) release, false to create a published one"),
  prerelease: z.boolean().optional().describe("true to identify the release as a prerelease, false to identify the release as a full release"),
  discussion_category_name: z.string().optional().describe("If specified, a discussion of the specified category is created and linked to the release"),
  generate_release_notes: z.boolean().optional().describe("Whether to automatically generate the name and body for this release"),
  make_latest: z.enum(["true", "false", "legacy"]).optional().describe("Specifies whether this release should be set as the latest release for the repository")
});

export const CreateReleaseSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("The name of the repository"),
  tag_name: z.string().describe("The name of the tag"),
  ...CreateReleaseOptionsSchema.shape
});

export const DeleteReleaseSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("The name of the repository"),
  release_id: z.number().describe("The ID of the release")
});

export const UpdateReleaseOptionsSchema = z.object({
  tag_name: z.string().optional().describe("The name of the tag"),
  target_commitish: z.string().optional().describe("Specifies the commitish value that determines where the Git tag is created from. Can be any branch or commit SHA."),
  name: z.string().optional().describe("The name of the release"),
  body: z.string().optional().describe("Text describing the contents of the tag"),
  draft: z.boolean().optional().describe("true makes the release a draft, and false publishes the release"),
  prerelease: z.boolean().optional().describe("true to identify the release as a prerelease, false to identify the release as a full release"),
  make_latest: z.enum(["true", "false", "legacy"]).optional().describe("Specifies whether this release should be set as the latest release for the repository"),
  discussion_category_name: z.string().optional().describe("If specified, a discussion of the specified category is created and linked to the release")
});

export const UpdateReleaseSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("The name of the repository"),
  release_id: z.number().describe("The unique identifier of the release"),
  ...UpdateReleaseOptionsSchema.shape
});

export const GenerateReleaseNotesOptionsSchema = z.object({
  tag_name: z.string().describe("The tag name for the release. This can be an existing tag or a new one."),
  target_commitish: z.string().optional().describe("Specifies the commitish value that will be the target for the release's tag."),
  previous_tag_name: z.string().optional().describe("The name of the previous tag to use as the starting point for the release notes."),
  configuration_file_path: z.string().optional().describe("Specifies a path to a file in the repository containing configuration settings used for generating the release notes.")
});

export const GenerateReleaseNotesSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("The name of the repository"),
  ...GenerateReleaseNotesOptionsSchema.shape
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

export async function getReleaseByTag(
  owner: string, 
  repo: string,
  tag: string
) {
  return githubRequest(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`);
}

export async function createRelease(
  owner: string,
  repo: string,
  releaseOptions: Omit<z.infer<typeof CreateReleaseOptionsSchema>, "owner" | "repo">
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases`;
  
  return githubRequest(
    url, 
    {
      method: "POST",
      body: releaseOptions
    }
  );
}

export async function deleteRelease(
  owner: string,
  repo: string,
  release_id: number
) {
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/releases/${release_id}`, 
    {
      method: "DELETE"
    }
  );
}

export async function updateRelease(
  owner: string,
  repo: string,
  release_id: number,
  updateOptions: Omit<z.infer<typeof UpdateReleaseOptionsSchema>, "owner" | "repo" | "release_id">
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/${release_id}`;
  
  return githubRequest(
    url, 
    {
      method: "PATCH",
      body: updateOptions
    }
  );
}

export async function generateReleaseNotes(
  owner: string,
  repo: string,
  options: z.infer<typeof GenerateReleaseNotesOptionsSchema>
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/generate-notes`;
  
  return githubRequest(
    url, 
    {
      method: "POST",
      body: options
    }
  );
}
