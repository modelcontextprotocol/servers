import { z } from 'zod';

// Base schemas for common types
export const GitHubAuthorSchema = z.object({
  name: z.string(),
  email: z.string(),
  date: z.string()
});

// Repository related schemas
export const GitHubOwnerSchema = z.object({
  login: z.string(),
  id: z.number(),
  node_id: z.string(),
  avatar_url: z.string(),
  url: z.string(),
  html_url: z.string(),
  type: z.string()
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
  default_branch: z.string()
});

// File content schemas
export const GitHubFileContentSchema = z.object({
  type: z.string(),
  encoding: z.string(),
  size: z.number(),
  name: z.string(),
  path: z.string(),
  content: z.string(),
  sha: z.string(),
  url: z.string(),
  git_url: z.string(),
  html_url: z.string(),
  download_url: z.string()
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
  download_url: z.string().nullable()
});

export const GitHubContentSchema = z.union([
  GitHubFileContentSchema,
  z.array(GitHubDirectoryContentSchema)
]);

// Operation schemas
export const FileOperationSchema = z.object({
  path: z.string(),
  content: z.string()
});

// Tree and commit schemas
export const GitHubTreeEntrySchema = z.object({
  path: z.string(),
  mode: z.enum(['100644', '100755', '040000', '160000', '120000']),
  type: z.enum(['blob', 'tree', 'commit']),
  size: z.number().optional(),
  sha: z.string(),
  url: z.string()
});

export const GitHubTreeSchema = z.object({
  sha: z.string(),
  url: z.string(),
  tree: z.array(GitHubTreeEntrySchema),
  truncated: z.boolean()
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
    url: z.string()
  }),
  parents: z.array(z.object({
    sha: z.string(),
    url: z.string()
  }))
});

// Reference schema
export const GitHubReferenceSchema = z.object({
  ref: z.string(),
  node_id: z.string(),
  url: z.string(),
  object: z.object({
    sha: z.string(),
    type: z.string(),
    url: z.string()
  })
});

// Input schemas for operations
export const CreateRepositoryOptionsSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  private: z.boolean().optional(),
  auto_init: z.boolean().optional()
});

export const CreateIssueOptionsSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  assignees: z.array(z.string()).optional(),
  milestone: z.number().optional(),
  labels: z.array(
    z.union([
      z.string(),
      z.object({
        name: z.string(),
        description: z.string().optional()
      })
    ])
  ).optional()
});

export const CreatePullRequestOptionsSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  head: z.string(),
  base: z.string(),
  maintainer_can_modify: z.boolean().optional(),
  draft: z.boolean().optional()
});

export const CreateBranchOptionsSchema = z.object({
  ref: z.string(),
  sha: z.string()
});

// Response schemas for operations
export const GitHubCreateUpdateFileResponseSchema = z.object({
  content: GitHubFileContentSchema.nullable(),
  commit: z.object({
    sha: z.string(),
    node_id: z.string(),
    url: z.string(),
    html_url: z.string(),
    author: GitHubAuthorSchema,
    committer: GitHubAuthorSchema,
    message: z.string(),
    tree: z.object({
      sha: z.string(),
      url: z.string()
    }),
    parents: z.array(z.object({
      sha: z.string(),
      url: z.string(),
      html_url: z.string()
    }))
  })
});

export const GitHubSearchResponseSchema = z.object({
  total_count: z.number(),
  incomplete_results: z.boolean(),
  items: z.array(GitHubRepositorySchema)
});

// Fork related schemas
export const GitHubForkParentSchema = z.object({
  name: z.string(),
  full_name: z.string(),
  owner: z.object({
    login: z.string(),
    id: z.number(),
    avatar_url: z.string()
  }),
  html_url: z.string()
});

export const GitHubForkSchema = GitHubRepositorySchema.extend({
  parent: GitHubForkParentSchema,
  source: GitHubForkParentSchema
});

// Issue related schemas
export const GitHubLabelSchema = z.object({
  id: z.number(),
  node_id: z.string(),
  url: z.string(),
  name: z.string(),
  color: z.string(),
  default: z.boolean(),
  description: z.string().optional()
});

export const GitHubIssueAssigneeSchema = z.object({
  login: z.string(),
  id: z.number(),
  avatar_url: z.string(),
  url: z.string(),
  html_url: z.string()
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
  state: z.string()
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
  body: z.string()
});

// Pull Request related schemas
export const GitHubPullRequestHeadSchema = z.object({
  label: z.string(),
  ref: z.string(),
  sha: z.string(),
  user: GitHubIssueAssigneeSchema,
  repo: GitHubRepositorySchema
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
  body: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  merged_at: z.string().nullable(),
  merge_commit_sha: z.string(),
  assignee: GitHubIssueAssigneeSchema.nullable(),
  assignees: z.array(GitHubIssueAssigneeSchema),
  head: GitHubPullRequestHeadSchema,
  base: GitHubPullRequestHeadSchema
});

const RepoParamsSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name")
});

export const CreateOrUpdateFileSchema = RepoParamsSchema.extend({
  path: z.string().describe("Path where to create/update the file"),
  content: z.string().describe("Content of the file"),
  message: z.string().describe("Commit message"),
  branch: z.string().describe("Branch to create/update the file in"),
  sha: z.string().optional()
    .describe("SHA of the file being replaced (required when updating existing files)")
});

export const SearchRepositoriesSchema = z.object({
  query: z.string().describe("Search query (see GitHub search syntax)"),
  page: z.number().optional().describe("Page number for pagination (default: 1)"),
  perPage: z.number().optional().describe("Number of results per page (default: 30, max: 100)")
});

export const CreateRepositorySchema = z.object({
  name: z.string().describe("Repository name"),
  description: z.string().optional().describe("Repository description"),
  private: z.boolean().optional().describe("Whether the repository should be private"),
  autoInit: z.boolean().optional().describe("Initialize with README.md")
});

export const GetFileContentsSchema = RepoParamsSchema.extend({
  path: z.string().describe("Path to the file or directory"),
  branch: z.string().optional().describe("Branch to get contents from")
});

export const PushFilesSchema = RepoParamsSchema.extend({
  branch: z.string().describe("Branch to push to (e.g., 'main' or 'master')"),
  files: z.array(z.object({
    path: z.string().describe("Path where to create the file"),
    content: z.string().describe("Content of the file")
  })).describe("Array of files to push"),
  message: z.string().describe("Commit message")
});

export const CreateIssueSchema = RepoParamsSchema.extend({
  title: z.string().describe("Issue title"),
  body: z.string().optional().describe("Issue body/description"),
  assignees: z.array(z.string()).optional().describe("Array of usernames to assign"),
  labels: z.array(
    z.union([
      z.string(),
      z.object({
        name: z.string(),
        description: z.string().optional()
      })
    ])
  ).optional().describe("Array of label names or label objects"),
  milestone: z.number().optional().describe("Milestone number to assign")
});

export const CreatePullRequestSchema = RepoParamsSchema.extend({
  title: z.string().describe("Pull request title"),
  body: z.string().optional().describe("Pull request body/description"),
  head: z.string().describe("The name of the branch where your changes are implemented"),
  base: z.string().describe("The name of the branch you want the changes pulled into"),
  draft: z.boolean().optional().describe("Whether to create the pull request as a draft"),
  maintainer_can_modify: z.boolean().optional()
    .describe("Whether maintainers can modify the pull request")
});

export const ForkRepositorySchema = RepoParamsSchema.extend({
  organization: z.string().optional()
    .describe("Optional: organization to fork to (defaults to your personal account)")
});

export const CreateBranchSchema = RepoParamsSchema.extend({
  branch: z.string().describe("Name for the new branch"),
  from_branch: z.string().optional()
    .describe("Optional: source branch to create from (defaults to the repository's default branch)")
});

// Export types
export type GitHubAuthor = z.infer<typeof GitHubAuthorSchema>;
export type GitHubFork = z.infer<typeof GitHubForkSchema>;
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;
export type GitHubPullRequest = z.infer<typeof GitHubPullRequestSchema>;export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>;
export type GitHubFileContent = z.infer<typeof GitHubFileContentSchema>;
export type GitHubDirectoryContent = z.infer<typeof GitHubDirectoryContentSchema>;
export type GitHubContent = z.infer<typeof GitHubContentSchema>;
export type FileOperation = z.infer<typeof FileOperationSchema>;
export type GitHubTree = z.infer<typeof GitHubTreeSchema>;
export type GitHubCommit = z.infer<typeof GitHubCommitSchema>;
export type GitHubReference = z.infer<typeof GitHubReferenceSchema>;
export type CreateRepositoryOptions = z.infer<typeof CreateRepositoryOptionsSchema>;
export type CreateIssueOptions = z.infer<typeof CreateIssueOptionsSchema>;
export type CreatePullRequestOptions = z.infer<typeof CreatePullRequestOptionsSchema>;
export type CreateBranchOptions = z.infer<typeof CreateBranchOptionsSchema>;
export type GitHubCreateUpdateFileResponse = z.infer<typeof GitHubCreateUpdateFileResponseSchema>;
export type GitHubSearchResponse = z.infer<typeof GitHubSearchResponseSchema>;