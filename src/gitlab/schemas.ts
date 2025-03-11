import { z } from 'zod';

// Base schemas for common types
export const GitLabAuthorSchema = z.object({
  name: z.string(),
  email: z.string(),
  date: z.string()
});

// Repository related schemas
export const GitLabOwnerSchema = z.object({
  username: z.string(), // Changed from login to match GitLab API
  id: z.number(),
  avatar_url: z.string().optional(),
  web_url: z.string().optional(), // Changed from html_url to match GitLab API
  name: z.string().optional(), // Added as GitLab includes full name
  state: z.string().optional() // Added as GitLab includes user state
}).optional();

export const GitLabRepositorySchema = z.object({
  id: z.number(),
  name: z.string(),
  path_with_namespace: z.string(), // Changed from full_name to match GitLab API
  visibility: z.string().optional(), // Changed from private to match GitLab API
  owner: GitLabOwnerSchema,
  web_url: z.string(), // Changed from html_url to match GitLab API
  description: z.string().nullable(),
  fork: z.boolean().optional(),
  ssh_url_to_repo: z.string().optional(), // Changed from ssh_url to match GitLab API
  http_url_to_repo: z.string().optional(), // Changed from clone_url to match GitLab API
  created_at: z.string().optional(),
  last_activity_at: z.string().optional(), // Changed from updated_at to match GitLab API
  default_branch: z.string().optional()
}).partial(); // Make all fields optional to handle API variations

// File content schemas
export const GitLabFileContentSchema = z.object({
  file_name: z.string(), // Changed from name to match GitLab API
  file_path: z.string(), // Changed from path to match GitLab API
  size: z.number(),
  encoding: z.string(),
  content: z.string(),
  content_sha256: z.string().optional(), // Changed from sha to match GitLab API
  ref: z.string().optional(), // Added as GitLab requires branch reference
  blob_id: z.string().optional(), // Added to match GitLab API
  last_commit_id: z.string().optional() // Added to match GitLab API
}).partial();

export const GitLabDirectoryContentSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.string(),
  mode: z.string().optional(),
  id: z.string().optional(), // Changed from sha to match GitLab API
  web_url: z.string().optional() // Changed from html_url to match GitLab API
}).partial();

export const GitLabContentSchema = z.union([
  GitLabFileContentSchema,
  z.array(GitLabDirectoryContentSchema)
]);

// Operation schemas
export const FileOperationSchema = z.object({
  path: z.string(),
  content: z.string()
});

// Tree and commit schemas
export const GitLabTreeEntrySchema = z.object({
  id: z.string(), // Changed from sha to match GitLab API
  name: z.string(),
  type: z.enum(['blob', 'tree']),
  path: z.string(),
  mode: z.string()
});

export const GitLabTreeSchema = z.object({
  id: z.string(), // Changed from sha to match GitLab API
  tree: z.array(GitLabTreeEntrySchema)
});

export const GitLabCommitSchema = z.object({
  id: z.string(), // Changed from sha to match GitLab API
  short_id: z.string(), // Added to match GitLab API
  title: z.string(), // Changed from message to match GitLab API
  author_name: z.string(),
  author_email: z.string(),
  authored_date: z.string(),
  committer_name: z.string(),
  committer_email: z.string(),
  committed_date: z.string(),
  web_url: z.string(), // Changed from html_url to match GitLab API
  parent_ids: z.array(z.string()) // Changed from parents to match GitLab API
});

// Reference schema
export const GitLabReferenceSchema = z.object({
  name: z.string(), // Changed from ref to match GitLab API
  commit: z.object({
    id: z.string(), // Changed from sha to match GitLab API
    web_url: z.string() // Changed from url to match GitLab API
  })
});

// Input schemas for operations
export const CreateRepositoryOptionsSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  visibility: z.enum(['private', 'internal', 'public']).optional(), // Changed from private to match GitLab API
  initialize_with_readme: z.boolean().optional() // Changed from auto_init to match GitLab API
});

export const CreateIssueOptionsSchema = z.object({
  title: z.string(),
  description: z.string().optional(), // Changed from body to match GitLab API
  assignee_ids: z.array(z.number()).optional(), // Changed from assignees to match GitLab API
  milestone_id: z.number().optional(), // Changed from milestone to match GitLab API
  labels: z.array(z.string()).optional()
});

export const CreateMergeRequestOptionsSchema = z.object({ // Changed from CreatePullRequestOptionsSchema
  title: z.string(),
  description: z.string().optional(), // Changed from body to match GitLab API
  source_branch: z.string(), // Changed from head to match GitLab API
  target_branch: z.string(), // Changed from base to match GitLab API
  allow_collaboration: z.boolean().optional(), // Changed from maintainer_can_modify to match GitLab API
  draft: z.boolean().optional()
});

export const CreateBranchOptionsSchema = z.object({
  name: z.string(), // Changed from ref to match GitLab API
  ref: z.string() // The source branch/commit for the new branch
});

// Response schemas for operations
export const GitLabCreateUpdateFileResponseSchema = z.object({
  file_path: z.string(),
  branch: z.string(),
  commit_id: z.string(), // Changed from sha to match GitLab API
  content: GitLabFileContentSchema.optional()
});

export const GitLabSearchResponseSchema = z.object({
  count: z.number(), // Changed from total_count to match GitLab API
  items: z.array(GitLabRepositorySchema)
});

// Fork related schemas
export const GitLabForkParentSchema = z.object({
  name: z.string(),
  path_with_namespace: z.string(), // Changed from full_name to match GitLab API
  owner: z.object({
    username: z.string(), // Changed from login to match GitLab API
    id: z.number(),
    avatar_url: z.string()
  }),
  web_url: z.string() // Changed from html_url to match GitLab API
});

export const GitLabForkSchema = GitLabRepositorySchema.extend({
  forked_from_project: GitLabForkParentSchema // Changed from parent to match GitLab API
});

// Issue related schemas
// Make labels more flexible - GitLab API sometimes returns strings, sometimes objects
export const GitLabLabelSchema = z.union([
  z.string(),
  z.object({
    id: z.number(),
    name: z.string(),
    color: z.string(),
    description: z.string().optional()
  })
]);

export const GitLabUserSchema = z.object({
  username: z.string(), // Changed from login to match GitLab API
  id: z.number(),
  name: z.string().optional(),
  avatar_url: z.string().optional(),
  web_url: z.string().optional() // Changed from html_url to match GitLab API
}).partial();

export const GitLabMilestoneSchema = z.object({
  id: z.number(),
  iid: z.number(), // Added to match GitLab API
  title: z.string(),
  description: z.string().optional().nullable(),
  state: z.string(),
  web_url: z.string().optional() // Changed from html_url to match GitLab API
}).partial();

export const GitLabIssueSchema = z.object({
  id: z.number(),
  iid: z.number(), // Added to match GitLab API
  project_id: z.number(), // Added to match GitLab API
  title: z.string(),
  description: z.string().optional().nullable(), // Changed from body to match GitLab API
  state: z.string(),
  author: GitLabUserSchema.optional(),
  assignees: z.array(GitLabUserSchema).optional(),
  labels: z.array(GitLabLabelSchema).optional(),
  milestone: GitLabMilestoneSchema.nullable().optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  closed_at: z.string().nullable().optional(),
  web_url: z.string().optional() // Changed from html_url to match GitLab API
}).partial(); // Make all fields optional to handle API variations

// Merge Request related schemas (equivalent to Pull Request)
export const GitLabMergeRequestDiffRefSchema = z.object({
  base_sha: z.string(),
  head_sha: z.string(),
  start_sha: z.string()
}).partial();

export const GitLabMergeRequestSchema = z.object({
  id: z.number(),
  iid: z.number(), // Added to match GitLab API
  project_id: z.number(), // Added to match GitLab API
  title: z.string(),
  description: z.string().nullable().optional(), // Changed from body to match GitLab API
  state: z.string(),
  merged: z.boolean().optional(),
  author: GitLabUserSchema.optional(),
  assignees: z.array(GitLabUserSchema).optional(),
  source_branch: z.string(), // Changed from head to match GitLab API
  target_branch: z.string(), // Changed from base to match GitLab API
  diff_refs: GitLabMergeRequestDiffRefSchema.optional(),
  web_url: z.string().optional(), // Changed from html_url to match GitLab API
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  merged_at: z.string().nullable().optional(),
  closed_at: z.string().nullable().optional(),
  merge_commit_sha: z.string().nullable().optional()
}).partial(); // Make all fields optional to handle API variations

// API Operation Parameter Schemas
const ProjectParamsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path") // Changed from owner/repo to match GitLab API
});

export const CreateOrUpdateFileSchema = ProjectParamsSchema.extend({
  file_path: z.string().describe("Path where to create/update the file"),
  content: z.string().describe("Content of the file"),
  commit_message: z.string().describe("Commit message"),
  branch: z.string().describe("Branch to create/update the file in"),
  previous_path: z.string().optional()
    .describe("Path of the file to move/rename")
});

export const SearchRepositoriesSchema = z.object({
  search: z.string().describe("Search query"), // Changed from query to match GitLab API
  page: z.number().optional().describe("Page number for pagination (default: 1)"),
  per_page: z.number().optional().describe("Number of results per page (default: 20)")
});

export const CreateRepositorySchema = z.object({
  name: z.string().describe("Repository name"),
  description: z.string().optional().describe("Repository description"),
  visibility: z.enum(['private', 'internal', 'public']).optional()
    .describe("Repository visibility level"),
  initialize_with_readme: z.boolean().optional()
    .describe("Initialize with README.md")
});

export const GetFileContentsSchema = ProjectParamsSchema.extend({
  file_path: z.string().describe("Path to the file or directory"),
  ref: z.string().optional().describe("Branch/tag/commit to get contents from")
});

export const PushFilesSchema = ProjectParamsSchema.extend({
  branch: z.string().describe("Branch to push to"),
  files: z.array(z.object({
    file_path: z.string().describe("Path where to create the file"),
    content: z.string().describe("Content of the file")
  })).describe("Array of files to push"),
  commit_message: z.string().describe("Commit message")
});

export const CreateIssueSchema = ProjectParamsSchema.extend({
  title: z.string().describe("Issue title"),
  description: z.string().optional().describe("Issue description"),
  assignee_ids: z.array(z.number()).optional().describe("Array of user IDs to assign"),
  labels: z.array(z.string()).optional().describe("Array of label names"),
  milestone_id: z.number().optional().describe("Milestone ID to assign")
});

export const CreateMergeRequestSchema = ProjectParamsSchema.extend({
  title: z.string().describe("Merge request title"),
  description: z.string().optional().describe("Merge request description"),
  source_branch: z.string().describe("Branch containing changes"),
  target_branch: z.string().describe("Branch to merge into"),
  draft: z.boolean().optional().describe("Create as draft merge request"),
  allow_collaboration: z.boolean().optional()
    .describe("Allow commits from upstream members")
});

export const ForkRepositorySchema = ProjectParamsSchema.extend({
  namespace: z.string().optional()
    .describe("Namespace to fork to (full path)")
});

export const CreateBranchSchema = ProjectParamsSchema.extend({
  branch: z.string().describe("Name for the new branch"),
  ref: z.string().optional()
    .describe("Source branch/commit for new branch")
});

export const GetIssueDetailsSchema = ProjectParamsSchema.extend({
  issue_iid: z.number().describe("Issue IID")
});

export const GetMergeRequestDetailsSchema = ProjectParamsSchema.extend({
  merge_request_iid: z.number().describe("Merge Request IID")
});

export const GetEpicDetailsSchema = z.object({
  group_id: z.string().describe("Group ID or URL-encoded path"),
  epic_iid: z.number().describe("Epic IID")
});

// Comment related schemas
export const GitLabCommentSchema = z.object({
  id: z.number(),
  content: z.string().optional(), // Field to consistently access comment content
  author: GitLabUserSchema.optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  system: z.boolean().optional(),
  noteable_id: z.number().optional(),
  noteable_type: z.string().optional(),
  web_url: z.string().optional()
}).partial();

// Epic related schemas (GitLab Premium/Ultimate feature)
export const GitLabEpicSchema = z.object({
  id: z.number(),
  iid: z.number(),
  group_id: z.number(),
  title: z.string(),
  description: z.string().nullable().optional(),
  state: z.string(),
  author: GitLabUserSchema.optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  web_url: z.string().optional(),
  labels: z.array(GitLabLabelSchema).optional(),
  children: z.array(z.object({
    id: z.number(),
    iid: z.number(),
    title: z.string(),
    state: z.string(),
    web_url: z.string().optional(),
    type: z.string().optional() // 'epic' or 'issue'
  })).optional()
}).partial(); // Make all fields optional to handle API variations

// User activity related schemas
export const GitLabEventSchema = z.object({
  id: z.number(),
  project_id: z.number().optional().nullable(),
  action_name: z.string(),
  target_id: z.number().optional().nullable(),
  target_type: z.string().optional().nullable(),
  author_id: z.number(),
  target_title: z.string().optional().nullable(),
  created_at: z.string(),
  author: GitLabUserSchema.optional(),
  push_data: z.record(z.string(), z.any()).optional(),
  note: z.record(z.string(), z.any()).optional()
}).partial();

export const GitLabUserActivitySchema = z.object({
  events: z.array(GitLabEventSchema),
  user: GitLabUserSchema.optional()
}).partial();

export const GetUserActivitySchema = z.object({
  user_id: z.string().describe("User ID or username"),
  per_page: z.number().optional().describe("Number of items per page (default: 20)"),
  page: z.number().optional().describe("Page number (default: 1)")
});


// Response schemas for detailed endpoints
export const GitLabIssueDetailsSchema = GitLabIssueSchema.extend({
  comments: z.array(GitLabCommentSchema).optional()
});

export const GitLabMergeRequestDetailsSchema = GitLabMergeRequestSchema.extend({
  comments: z.array(GitLabCommentSchema).optional()
});

export const GitLabEpicDetailsSchema = GitLabEpicSchema.extend({
  comments: z.array(GitLabCommentSchema).optional()
});

// Export types
export type GitLabAuthor = z.infer<typeof GitLabAuthorSchema>;
export type GitLabFork = z.infer<typeof GitLabForkSchema>;
export type GitLabIssue = z.infer<typeof GitLabIssueSchema>;
export type GitLabMergeRequest = z.infer<typeof GitLabMergeRequestSchema>;
export type GitLabRepository = z.infer<typeof GitLabRepositorySchema>;
export type GitLabFileContent = z.infer<typeof GitLabFileContentSchema>;
export type GitLabDirectoryContent = z.infer<typeof GitLabDirectoryContentSchema>;
export type GitLabContent = z.infer<typeof GitLabContentSchema>;
export type FileOperation = z.infer<typeof FileOperationSchema>;
export type GitLabTree = z.infer<typeof GitLabTreeSchema>;
export type GitLabCommit = z.infer<typeof GitLabCommitSchema>;
export type GitLabReference = z.infer<typeof GitLabReferenceSchema>;
export type CreateRepositoryOptions = z.infer<typeof CreateRepositoryOptionsSchema>;
export type CreateIssueOptions = z.infer<typeof CreateIssueOptionsSchema>;
export type CreateMergeRequestOptions = z.infer<typeof CreateMergeRequestOptionsSchema>;
export type CreateBranchOptions = z.infer<typeof CreateBranchOptionsSchema>;
export type GitLabCreateUpdateFileResponse = z.infer<typeof GitLabCreateUpdateFileResponseSchema>;
export type GitLabSearchResponse = z.infer<typeof GitLabSearchResponseSchema>;
export type GitLabComment = z.infer<typeof GitLabCommentSchema>;
export type GitLabEpic = z.infer<typeof GitLabEpicSchema>;
export type GitLabIssueDetails = z.infer<typeof GitLabIssueDetailsSchema>;
export type GitLabMergeRequestDetails = z.infer<typeof GitLabMergeRequestDetailsSchema>;
export type GitLabEpicDetails = z.infer<typeof GitLabEpicDetailsSchema>;
export type GitLabEvent = z.infer<typeof GitLabEventSchema>;
export type GitLabUserActivity = z.infer<typeof GitLabUserActivitySchema>;