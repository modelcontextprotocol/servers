import { z } from "zod";

// Base schemas for common types
export const GitHubAuthorSchema = z.object({
  name: z.string(),
  email: z.string(),
  date: z.string(),
});

// Repository related schemas
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
  download_url: z.string(),
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

// Operation schemas
export const FileOperationSchema = z.object({
  path: z.string(),
  content: z.string(),
});

// Tree and commit schemas
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

// Reference schema
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

// Input schemas for operations
export const CreateRepositoryOptionsSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  private: z.boolean().optional(),
  auto_init: z.boolean().optional(),
});

export const CreateIssueOptionsSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  assignees: z.array(z.string()).optional(),
  milestone: z.number().optional(),
  labels: z.array(z.string()).optional(),
});

export const CreatePullRequestOptionsSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  head: z.string(),
  base: z.string(),
  maintainer_can_modify: z.boolean().optional(),
  draft: z.boolean().optional(),
});

export const CreateBranchOptionsSchema = z.object({
  ref: z.string(),
  sha: z.string(),
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
      url: z.string(),
    }),
    parents: z.array(
      z.object({
        sha: z.string(),
        url: z.string(),
        html_url: z.string(),
      })
    ),
  }),
});

export const GitHubSearchResponseSchema = z.object({
  total_count: z.number(),
  incomplete_results: z.boolean(),
  items: z.array(GitHubRepositorySchema),
});

// Fork related schemas
export const GitHubForkParentSchema = z.object({
  name: z.string(),
  full_name: z.string(),
  owner: z.object({
    login: z.string(),
    id: z.number(),
    avatar_url: z.string(),
  }),
  html_url: z.string(),
});

export const GitHubForkSchema = GitHubRepositorySchema.extend({
  parent: GitHubForkParentSchema,
  source: GitHubForkParentSchema,
});

// Issue related schemas
export const GitHubLabelSchema = z.object({
  id: z.number(),
  node_id: z.string(),
  url: z.string(),
  name: z.string(),
  color: z.string(),
  default: z.boolean(),
  description: z.string().optional(),
});

export const GitHubIssueAssigneeSchema = z.object({
  login: z.string(),
  id: z.number(),
  avatar_url: z.string(),
  url: z.string(),
  html_url: z.string(),
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

// Pull Request related schemas
export const GitHubPullRequestHeadSchema = z.object({
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
  body: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  merged_at: z.string().nullable(),
  merge_commit_sha: z.string().nullable(),
  assignee: GitHubIssueAssigneeSchema.nullable(),
  assignees: z.array(GitHubIssueAssigneeSchema),
  head: GitHubPullRequestHeadSchema,
  base: GitHubPullRequestHeadSchema,
});

const RepoParamsSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
});

export const CreateOrUpdateFileSchema = RepoParamsSchema.extend({
  path: z.string().describe("Path where to create/update the file"),
  content: z.string().describe("Content of the file"),
  message: z.string().describe("Commit message"),
  branch: z.string().describe("Branch to create/update the file in"),
  sha: z
    .string()
    .optional()
    .describe(
      "SHA of the file being replaced (required when updating existing files)"
    ),
});

export const SearchRepositoriesSchema = z.object({
  query: z.string().describe("Search query (see GitHub search syntax)"),
  page: z
    .number()
    .optional()
    .describe("Page number for pagination (default: 1)"),
  perPage: z
    .number()
    .optional()
    .describe("Number of results per page (default: 30, max: 100)"),
});

export const ListCommitsSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  page: z.number().optional().describe("Page number for pagination (default: 1)"),
  perPage: z.number().optional().describe("Number of results per page (default: 30, max: 100)"),
  sha: z.string().optional()
    .describe("SHA of the file being replaced (required when updating existing files)")
});

export const CreateRepositorySchema = z.object({
  name: z.string().describe("Repository name"),
  description: z.string().optional().describe("Repository description"),
  private: z
    .boolean()
    .optional()
    .describe("Whether the repository should be private"),
  autoInit: z.boolean().optional().describe("Initialize with README.md"),
});

export const GetFileContentsSchema = RepoParamsSchema.extend({
  path: z.string().describe("Path to the file or directory"),
  branch: z.string().optional().describe("Branch to get contents from"),
});

export const PushFilesSchema = RepoParamsSchema.extend({
  branch: z.string().describe("Branch to push to (e.g., 'main' or 'master')"),
  files: z
    .array(
      z.object({
        path: z.string().describe("Path where to create the file"),
        content: z.string().describe("Content of the file"),
      })
    )
    .describe("Array of files to push"),
  message: z.string().describe("Commit message"),
});

export const CreateIssueSchema = RepoParamsSchema.extend({
  title: z.string().describe("Issue title"),
  body: z.string().optional().describe("Issue body/description"),
  assignees: z
    .array(z.string())
    .optional()
    .describe("Array of usernames to assign"),
  labels: z.array(z.string()).optional().describe("Array of label names"),
  milestone: z.number().optional().describe("Milestone number to assign"),
});

export const CreatePullRequestSchema = RepoParamsSchema.extend({
  title: z.string().describe("Pull request title"),
  body: z.string().optional().describe("Pull request body/description"),
  head: z
    .string()
    .describe("The name of the branch where your changes are implemented"),
  base: z
    .string()
    .describe("The name of the branch you want the changes pulled into"),
  draft: z
    .boolean()
    .optional()
    .describe("Whether to create the pull request as a draft"),
  maintainer_can_modify: z
    .boolean()
    .optional()
    .describe("Whether maintainers can modify the pull request"),
});

export const ForkRepositorySchema = RepoParamsSchema.extend({
  organization: z
    .string()
    .optional()
    .describe(
      "Optional: organization to fork to (defaults to your personal account)"
    ),
});

export const CreateBranchSchema = RepoParamsSchema.extend({
  branch: z.string().describe("Name for the new branch"),
  from_branch: z
    .string()
    .optional()
    .describe(
      "Optional: source branch to create from (defaults to the repository's default branch)"
    ),
});

/**
 * Response schema for a code search result item
 * @see https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#search-code
 */
export const SearchCodeItemSchema = z.object({
  name: z.string().describe("The name of the file"),
  path: z.string().describe("The path to the file in the repository"),
  sha: z.string().describe("The SHA hash of the file"),
  url: z.string().describe("The API URL for this file"),
  git_url: z.string().describe("The Git URL for this file"),
  html_url: z.string().describe("The HTML URL to view this file on GitHub"),
  repository: GitHubRepositorySchema.describe(
    "The repository where this file was found"
  ),
  score: z.number().describe("The search result score"),
});

/**
 * Response schema for code search results
 */
export const SearchCodeResponseSchema = z.object({
  total_count: z.number().describe("Total number of matching results"),
  incomplete_results: z
    .boolean()
    .describe("Whether the results are incomplete"),
  items: z.array(SearchCodeItemSchema).describe("The search results"),
});

/**
 * Response schema for an issue search result item
 * @see https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#search-issues-and-pull-requests
 */
export const SearchIssueItemSchema = z.object({
  url: z.string().describe("The API URL for this issue"),
  repository_url: z
    .string()
    .describe("The API URL for the repository where this issue was found"),
  labels_url: z.string().describe("The API URL for the labels of this issue"),
  comments_url: z.string().describe("The API URL for comments of this issue"),
  events_url: z.string().describe("The API URL for events of this issue"),
  html_url: z.string().describe("The HTML URL to view this issue on GitHub"),
  id: z.number().describe("The ID of this issue"),
  node_id: z.string().describe("The Node ID of this issue"),
  number: z.number().describe("The number of this issue"),
  title: z.string().describe("The title of this issue"),
  user: GitHubIssueAssigneeSchema.describe("The user who created this issue"),
  labels: z.array(GitHubLabelSchema).describe("The labels of this issue"),
  state: z.string().describe("The state of this issue"),
  locked: z.boolean().describe("Whether this issue is locked"),
  assignee: GitHubIssueAssigneeSchema.nullable().describe(
    "The assignee of this issue"
  ),
  assignees: z
    .array(GitHubIssueAssigneeSchema)
    .describe("The assignees of this issue"),
  comments: z.number().describe("The number of comments on this issue"),
  created_at: z.string().describe("The creation time of this issue"),
  updated_at: z.string().describe("The last update time of this issue"),
  closed_at: z.string().nullable().describe("The closure time of this issue"),
  body: z.string().describe("The body of this issue"),
  score: z.number().describe("The search result score"),
  pull_request: z
    .object({
      url: z.string().describe("The API URL for this pull request"),
      html_url: z.string().describe("The HTML URL to view this pull request"),
      diff_url: z.string().describe("The URL to view the diff"),
      patch_url: z.string().describe("The URL to view the patch"),
    })
    .optional()
    .describe("Pull request details if this is a PR"),
});

/**
 * Response schema for issue search results
 */
export const SearchIssuesResponseSchema = z.object({
  total_count: z.number().describe("Total number of matching results"),
  incomplete_results: z
    .boolean()
    .describe("Whether the results are incomplete"),
  items: z.array(SearchIssueItemSchema).describe("The search results"),
});

/**
 * Response schema for a user search result item
 * @see https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#search-users
 */
export const SearchUserItemSchema = z.object({
  login: z.string().describe("The username of the user"),
  id: z.number().describe("The ID of the user"),
  node_id: z.string().describe("The Node ID of the user"),
  avatar_url: z.string().describe("The avatar URL of the user"),
  gravatar_id: z.string().describe("The Gravatar ID of the user"),
  url: z.string().describe("The API URL for this user"),
  html_url: z.string().describe("The HTML URL to view this user on GitHub"),
  followers_url: z.string().describe("The API URL for followers of this user"),
  following_url: z.string().describe("The API URL for following of this user"),
  gists_url: z.string().describe("The API URL for gists of this user"),
  starred_url: z
    .string()
    .describe("The API URL for starred repositories of this user"),
  subscriptions_url: z
    .string()
    .describe("The API URL for subscriptions of this user"),
  organizations_url: z
    .string()
    .describe("The API URL for organizations of this user"),
  repos_url: z.string().describe("The API URL for repositories of this user"),
  events_url: z.string().describe("The API URL for events of this user"),
  received_events_url: z
    .string()
    .describe("The API URL for received events of this user"),
  type: z.string().describe("The type of this user"),
  site_admin: z.boolean().describe("Whether this user is a site administrator"),
  score: z.number().describe("The search result score"),
});

/**
 * Response schema for user search results
 */
export const SearchUsersResponseSchema = z.object({
  total_count: z.number().describe("Total number of matching results"),
  incomplete_results: z
    .boolean()
    .describe("Whether the results are incomplete"),
  items: z.array(SearchUserItemSchema).describe("The search results"),
});

/**
 * Input schema for code search
 * @see https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#search-code--parameters
 */
export const SearchCodeSchema = z.object({
  q: z
    .string()
    .describe(
      "Search query. See GitHub code search syntax: https://docs.github.com/en/search-github/searching-on-github/searching-code"
    ),
  order: z
    .enum(["asc", "desc"])
    .optional()
    .describe("Sort order (asc or desc)"),
  per_page: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Results per page (max 100)"),
  page: z.number().min(1).optional().describe("Page number"),
});

/**
 * Input schema for issues search
 * @see https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#search-issues-and-pull-requests--parameters
 */
export const SearchIssuesSchema = z.object({
  q: z
    .string()
    .describe(
      "Search query. See GitHub issues search syntax: https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests"
    ),
  sort: z
    .enum([
      "comments",
      "reactions",
      "reactions-+1",
      "reactions--1",
      "reactions-smile",
      "reactions-thinking_face",
      "reactions-heart",
      "reactions-tada",
      "interactions",
      "created",
      "updated",
    ])
    .optional()
    .describe("Sort field"),
  order: z
    .enum(["asc", "desc"])
    .optional()
    .describe("Sort order (asc or desc)"),
  per_page: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Results per page (max 100)"),
  page: z.number().min(1).optional().describe("Page number"),
});

/**
 * Input schema for users search
 * @see https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#search-users--parameters
 */
export const SearchUsersSchema = z.object({
  q: z
    .string()
    .describe(
      "Search query. See GitHub users search syntax: https://docs.github.com/en/search-github/searching-on-github/searching-users"
    ),
  sort: z
    .enum(["followers", "repositories", "joined"])
    .optional()
    .describe("Sort field"),
  order: z
    .enum(["asc", "desc"])
    .optional()
    .describe("Sort order (asc or desc)"),
  per_page: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Results per page (max 100)"),
  page: z.number().min(1).optional().describe("Page number"),
});

// Add these schema definitions for issue management

export const ListIssuesOptionsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  state: z.enum(['open', 'closed', 'all']).optional(),
  labels: z.array(z.string()).optional(),
  sort: z.enum(['created', 'updated', 'comments']).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
  since: z.string().optional(), // ISO 8601 timestamp
  page: z.number().optional(),
  per_page: z.number().optional()
});

export const UpdateIssueOptionsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
  title: z.string().optional(),
  body: z.string().optional(),
  state: z.enum(['open', 'closed']).optional(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  milestone: z.number().optional()
});

export const IssueCommentSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
  body: z.string()
});

export const GetIssueSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  issue_number: z.number().describe("Issue number")
});

export const GetPullRequestSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number")
});

export const ListPullRequestsSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  state: z.enum(['open', 'closed', 'all']).optional().describe("State of the pull requests to return"),
  head: z.string().optional().describe("Filter by head user or head organization and branch name"),
  base: z.string().optional().describe("Filter by base branch name"),
  sort: z.enum(['created', 'updated', 'popularity', 'long-running']).optional().describe("What to sort results by"),
  direction: z.enum(['asc', 'desc']).optional().describe("The direction of the sort"),
  per_page: z.number().optional().describe("Results per page (max 100)"),
  page: z.number().optional().describe("Page number of the results")
});

export const CreatePullRequestReviewSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number"),
  commit_id: z.string().optional().describe("The SHA of the commit that needs a review"),
  body: z.string().describe("The body text of the review"),
  event: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']).describe("The review action to perform"),
  comments: z.array(z.object({
    path: z.string().describe("The relative path to the file being commented on"),
    position: z.number().describe("The position in the diff where you want to add a review comment"),
    body: z.string().describe("Text of the review comment")
  })).optional().describe("Comments to post as part of the review")
});

// Export types
export type GitHubAuthor = z.infer<typeof GitHubAuthorSchema>;
export type GitHubFork = z.infer<typeof GitHubForkSchema>;
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;
export type GitHubPullRequest = z.infer<typeof GitHubPullRequestSchema>;
export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>;
export type GitHubFileContent = z.infer<typeof GitHubFileContentSchema>;
export type GitHubDirectoryContent = z.infer<
  typeof GitHubDirectoryContentSchema
>;
export type GitHubContent = z.infer<typeof GitHubContentSchema>;
export type FileOperation = z.infer<typeof FileOperationSchema>;
export type GitHubTree = z.infer<typeof GitHubTreeSchema>;
export type GitHubCommit = z.infer<typeof GitHubCommitSchema>;
export type GitHubListCommits = z.infer<typeof GitHubListCommitsSchema>;
export type GitHubReference = z.infer<typeof GitHubReferenceSchema>;
export type CreateRepositoryOptions = z.infer<
  typeof CreateRepositoryOptionsSchema
>;
export type CreateIssueOptions = z.infer<typeof CreateIssueOptionsSchema>;
export type CreatePullRequestOptions = z.infer<
  typeof CreatePullRequestOptionsSchema
>;
export type CreateBranchOptions = z.infer<typeof CreateBranchOptionsSchema>;
export type GitHubCreateUpdateFileResponse = z.infer<
  typeof GitHubCreateUpdateFileResponseSchema
>;
export type GitHubSearchResponse = z.infer<typeof GitHubSearchResponseSchema>;
export type SearchCodeItem = z.infer<typeof SearchCodeItemSchema>;
export type SearchCodeResponse = z.infer<typeof SearchCodeResponseSchema>;
export type SearchIssueItem = z.infer<typeof SearchIssueItemSchema>;
export type SearchIssuesResponse = z.infer<typeof SearchIssuesResponseSchema>;
export type SearchUserItem = z.infer<typeof SearchUserItemSchema>;
export type SearchUsersResponse = z.infer<typeof SearchUsersResponseSchema>;
export type GetPullRequest = z.infer<typeof GetPullRequestSchema>;
export type ListPullRequests = z.infer<typeof ListPullRequestsSchema>;
export type CreatePullRequestReview = z.infer<typeof CreatePullRequestReviewSchema>;

// Schema for merging a pull request
export const MergePullRequestSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number"),
  commit_title: z.string().optional().describe("Title for the automatic commit message"),
  commit_message: z.string().optional().describe("Extra detail to append to automatic commit message"),
  merge_method: z.enum(['merge', 'squash', 'rebase']).optional().describe("Merge method to use")
});

// Schema for getting PR files
export const GetPullRequestFilesSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"), 
  pull_number: z.number().describe("Pull request number")
});

export const PullRequestFileSchema = z.object({
  sha: z.string(),
  filename: z.string(),
  status: z.enum(['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged']),
  additions: z.number(),
  deletions: z.number(),
  changes: z.number(),
  blob_url: z.string(),
  raw_url: z.string(),
  contents_url: z.string(),
  patch: z.string().optional()
});

// Schema for checking PR status
export const GetPullRequestStatusSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number")
});

export const StatusCheckSchema = z.object({
  url: z.string(),
  state: z.enum(['error', 'failure', 'pending', 'success']),
  description: z.string().nullable(),
  target_url: z.string().nullable(),
  context: z.string(),
  created_at: z.string(),
  updated_at: z.string()
});

export const CombinedStatusSchema = z.object({
  state: z.enum(['error', 'failure', 'pending', 'success']),
  statuses: z.array(StatusCheckSchema),
  sha: z.string(),
  total_count: z.number()
});

export type MergePullRequest = z.infer<typeof MergePullRequestSchema>;
export type GetPullRequestFiles = z.infer<typeof GetPullRequestFilesSchema>;
export type PullRequestFile = z.infer<typeof PullRequestFileSchema>;
export type GetPullRequestStatus = z.infer<typeof GetPullRequestStatusSchema>;
export type StatusCheck = z.infer<typeof StatusCheckSchema>;
// Schema for updating a pull request branch
export const UpdatePullRequestBranchSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number"),
  expected_head_sha: z.string().optional().describe("The expected SHA of the pull request's HEAD ref")
});

// Schema for PR comments
export const GetPullRequestCommentsSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number")
});

export const PullRequestCommentSchema = z.object({
  url: z.string(),
  id: z.number(),
  node_id: z.string(),
  pull_request_review_id: z.number().nullable(),
  diff_hunk: z.string(),
  path: z.string().nullable(),
  position: z.number().nullable(),
  original_position: z.number().nullable(),
  commit_id: z.string(),
  original_commit_id: z.string(),
  user: GitHubIssueAssigneeSchema,
  body: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  html_url: z.string(),
  pull_request_url: z.string(),
  author_association: z.string(),
  _links: z.object({
    self: z.object({ href: z.string() }),
    html: z.object({ href: z.string() }),
    pull_request: z.object({ href: z.string() })
  })
});

export type CombinedStatus = z.infer<typeof CombinedStatusSchema>;
export type UpdatePullRequestBranch = z.infer<typeof UpdatePullRequestBranchSchema>;
export type GetPullRequestComments = z.infer<typeof GetPullRequestCommentsSchema>;
export type PullRequestComment = z.infer<typeof PullRequestCommentSchema>;

// Schema for listing PR reviews
export const GetPullRequestReviewsSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number")
});

export const PullRequestReviewSchema = z.object({
  id: z.number(),
  node_id: z.string(),
  user: GitHubIssueAssigneeSchema,
  body: z.string().nullable(),
  state: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING']),
  html_url: z.string(),
  pull_request_url: z.string(),
  commit_id: z.string(),
  submitted_at: z.string().nullable(),
  author_association: z.string()
});

export type GetPullRequestReviews = z.infer<typeof GetPullRequestReviewsSchema>;
export type PullRequestReview = z.infer<typeof PullRequestReviewSchema>;
