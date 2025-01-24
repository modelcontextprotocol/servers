import { z } from "zod";

// Base schemas for common types
export const GitHubAuthorSchema = z.object({
  name: z.string(),
  email: z.string(),
  date: z.string(),
});

export const GitHubOwnerSchema = z.object({
  login: z.string(),
  id: z.number(),
  node_id: z.string(),
  avatar_url: z.string(),
  url: z.string(),
  html_url: z.string(),
  type: z.string(),
});

export const GitHubRepositorySchema = z.object({
  id: z.number(),
  node_id: z.string(),
  name: z.string(),
  full_name: z.string(),
  private: z.boolean(),
  owner: GitHubOwnerSchema,
  html_url: z.string(),
  description: z.string().nullable(),
  fork: z.boolean(),
  url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  pushed_at: z.string(),
  git_url: z.string(),
  ssh_url: z.string(),
  clone_url: z.string(),
  default_branch: z.string(),
});

export const GithubFileContentLinks = z.object({
  self: z.string(),
  git: z.string().nullable(),
  html: z.string().nullable()
});

export const GitHubFileContentSchema = z.object({
  name: z.string(),
  path: z.string(),
  sha: z.string(),
  size: z.number(),
  url: z.string(),
  html_url: z.string(),
  git_url: z.string(),
  download_url: z.string(),
  type: z.string(),
  content: z.string().optional(),
  encoding: z.string().optional(),
  _links: GithubFileContentLinks
});

export const GitHubDirectoryContentSchema = z.object({
  type: z.string(),
  size: z.number(),
  name: z.string(),
  path: z.string(),
  sha: z.string(),
  url: z.string(),
  git_url: z.string(),
  html_url: z.string(),
  download_url: z.string().nullable(),
});

export const GitHubContentSchema = z.union([
  GitHubFileContentSchema,
  z.array(GitHubDirectoryContentSchema),
]);

export const GitHubTreeEntrySchema = z.object({
  path: z.string(),
  mode: z.enum(["100644", "100755", "040000", "160000", "120000"]),
  type: z.enum(["blob", "tree", "commit"]),
  size: z.number().optional(),
  sha: z.string(),
  url: z.string(),
});

export const GitHubTreeSchema = z.object({
  sha: z.string(),
  url: z.string(),
  tree: z.array(GitHubTreeEntrySchema),
  truncated: z.boolean(),
});

export const GitHubCommitSchema = z.object({
  sha: z.string(),
  node_id: z.string(),
  url: z.string(),
  author: GitHubAuthorSchema,
  committer: GitHubAuthorSchema,
  message: z.string(),
  tree: z.object({
    sha: z.string(),
    url: z.string(),
  }),
  parents: z.array(
    z.object({
      sha: z.string(),
      url: z.string(),
    })
  ),
});

export const GitHubListCommitsSchema = z.array(z.object({
  sha: z.string(),
  node_id: z.string(),
  commit: z.object({
    author: GitHubAuthorSchema,
    committer: GitHubAuthorSchema,
    message: z.string(),
    tree: z.object({
      sha: z.string(),
      url: z.string()
    }),
    url: z.string(),
    comment_count: z.number(),
  }),
  url: z.string(),
  html_url: z.string(),
  comments_url: z.string()
}));

export const GitHubReferenceSchema = z.object({
  ref: z.string(),
  node_id: z.string(),
  url: z.string(),
  object: z.object({
    sha: z.string(),
    type: z.string(),
    url: z.string(),
  }),
});

// User and assignee schemas
export const GitHubIssueAssigneeSchema = z.object({
  login: z.string(),
  id: z.number(),
  avatar_url: z.string(),
  url: z.string(),
  html_url: z.string(),
});

// Issue-related schemas
export const GitHubLabelSchema = z.object({
  id: z.number(),
  node_id: z.string(),
  url: z.string(),
  name: z.string(),
  color: z.string(),
  default: z.boolean(),
  description: z.string().optional(),
});

export const GitHubMilestoneSchema = z.object({
  url: z.string(),
  html_url: z.string(),
  labels_url: z.string(),
  id: z.number(),
  node_id: z.string(),
  number: z.number(),
  title: z.string(),
  description: z.string(),
  state: z.string(),
});

export const GitHubIssueSchema = z.object({
  url: z.string(),
  repository_url: z.string(),
  labels_url: z.string(),
  comments_url: z.string(),
  events_url: z.string(),
  html_url: z.string(),
  id: z.number(),
  node_id: z.string(),
  number: z.number(),
  title: z.string(),
  user: GitHubIssueAssigneeSchema,
  labels: z.array(GitHubLabelSchema),
  state: z.string(),
  locked: z.boolean(),
  assignee: GitHubIssueAssigneeSchema.nullable(),
  assignees: z.array(GitHubIssueAssigneeSchema),
  milestone: GitHubMilestoneSchema.nullable(),
  comments: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  body: z.string().nullable(),
});

// Search-related schemas
export const GitHubSearchResponseSchema = z.object({
  total_count: z.number(),
  incomplete_results: z.boolean(),
  items: z.array(GitHubRepositorySchema),
});

// Pull request schemas
export const GitHubPullRequestRefSchema = z.object({
  label: z.string(),
  ref: z.string(),
  sha: z.string(),
  user: GitHubIssueAssigneeSchema,
  repo: GitHubRepositorySchema,
});

export const GitHubPullRequestSchema = z.object({
  url: z.string(),
  id: z.number(),
  node_id: z.string(),
  html_url: z.string(),
  diff_url: z.string(),
  patch_url: z.string(),
  issue_url: z.string(),
  number: z.number(),
  state: z.string(),
  locked: z.boolean(),
  title: z.string(),
  user: GitHubIssueAssigneeSchema,
  body: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  merged_at: z.string().nullable(),
  merge_commit_sha: z.string().nullable(),
  assignee: GitHubIssueAssigneeSchema.nullable(),
  assignees: z.array(GitHubIssueAssigneeSchema),
  requested_reviewers: z.array(GitHubIssueAssigneeSchema),
  labels: z.array(GitHubLabelSchema),
  head: GitHubPullRequestRefSchema,
  base: GitHubPullRequestRefSchema,
});

// Export types
export type GitHubAuthor = z.infer<typeof GitHubAuthorSchema>;
export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>;
export type GitHubFileContent = z.infer<typeof GitHubFileContentSchema>;
export type GitHubDirectoryContent = z.infer<typeof GitHubDirectoryContentSchema>;
export type GitHubContent = z.infer<typeof GitHubContentSchema>;
export type GitHubTree = z.infer<typeof GitHubTreeSchema>;
export type GitHubCommit = z.infer<typeof GitHubCommitSchema>;
export type GitHubListCommits = z.infer<typeof GitHubListCommitsSchema>;
export type GitHubReference = z.infer<typeof GitHubReferenceSchema>;
export type GitHubIssueAssignee = z.infer<typeof GitHubIssueAssigneeSchema>;
export type GitHubLabel = z.infer<typeof GitHubLabelSchema>;
export type GitHubMilestone = z.infer<typeof GitHubMilestoneSchema>;
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;
export type GitHubSearchResponse = z.infer<typeof GitHubSearchResponseSchema>;
export type GitHubPullRequest = z.infer<typeof GitHubPullRequestSchema>;
// Release schemas
export const GitHubReleaseAssetSchema = z.object({
  url: z.string(),
  id: z.number(),
  node_id: z.string(),
  name: z.string(),
  label: z.string().nullable(),
  content_type: z.string(),
  state: z.string(),
  size: z.number(),
  download_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  browser_download_url: z.string()
});

export const GitHubReleaseSchema = z.object({
  url: z.string(),
  assets_url: z.string(),
  upload_url: z.string(),
  html_url: z.string(),
  id: z.number(),
  node_id: z.string(),
  tag_name: z.string(),
  target_commitish: z.string(),
  name: z.string().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  created_at: z.string(),
  published_at: z.string().nullable(),
  assets: z.array(GitHubReleaseAssetSchema).optional(),
  tarball_url: z.string(),
  zipball_url: z.string(),
  body: z.string().nullable(),
  author: GitHubOwnerSchema
}).transform(data => {
  // Ensure assets is always an array even if not included
  return {
    ...data,
    assets: data.assets || []
  };
});

export type GitHubRelease = z.infer<typeof GitHubReleaseSchema>;
export type GitHubReleaseAsset = z.infer<typeof GitHubReleaseAssetSchema>;
export type GitHubPullRequestRef = z.infer<typeof GitHubPullRequestRefSchema>;