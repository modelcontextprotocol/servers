import { z } from "zod";

// Definition of Basic Types
export const GiteeUserSchema = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
  url: z.string().url(),
  html_url: z.string().url(),
  remark: z.string().nullable(),
  followers_url: z.string().url(),
  following_url: z.string().url(),
  gists_url: z.string().url(),
  starred_url: z.string().url(),
  subscriptions_url: z.string().url(),
  organizations_url: z.string().url(),
  repos_url: z.string().url(),
  events_url: z.string().url(),
  received_events_url: z.string().url(),
  type: z.string(),
  site_admin: z.boolean().optional().default(false),
  blog: z.string().nullable().optional(),
  weibo: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  public_repos: z.number().optional(),
  public_gists: z.number().optional(),
  followers: z.number().optional(),
  following: z.number().optional(),
  stared: z.number().optional(),
  watched: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  email: z.string().email().nullable().optional(),
});

// Declare a type and then define it to avoid circular references.
export type GiteeRepositorySchemaType = z.ZodObject<any>;
export let GiteeRepositorySchema: GiteeRepositorySchemaType;

GiteeRepositorySchema = z.object({
  id: z.number(),
  full_name: z.string(),
  human_name: z.string(),
  url: z.string().url(),
  namespace: z.object({
    id: z.number(),
    name: z.string(),
    path: z.string(),
    type: z.string(),
  }),
  path: z.string(),
  name: z.string(),
  owner: GiteeUserSchema,
  assigner: GiteeUserSchema.nullable(),
  description: z.string().nullable(),
  private: z.boolean(),
  public: z.boolean(),
  internal: z.boolean(),
  fork: z.boolean(),
  html_url: z.string().url(),
  ssh_url: z.string(),
  forks_url: z.string().url().optional(),
  keys_url: z.string().url().optional(),
  collaborators_url: z.string().url().optional(),
  hooks_url: z.string().url().optional(),
  branches_url: z.string().url().optional(),
  tags_url: z.string().url().optional(),
  blobs_url: z.string().url().optional(),
  stargazers_url: z.string().url().optional(),
  contributors_url: z.string().url().optional(),
  commits_url: z.string().url().optional(),
  comments_url: z.string().url().optional(),
  issue_comment_url: z.string().url().optional(),
  issues_url: z.string().url().optional(),
  pulls_url: z.string().url().optional(),
  milestones_url: z.string().url().optional(),
  notifications_url: z.string().url().optional(),
  labels_url: z.string().url().optional(),
  releases_url: z.string().url().optional(),
  recommend: z.boolean().optional(),
  gvp: z.boolean().optional(),
  homepage: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  forks_count: z.number().optional(),
  stargazers_count: z.number().optional(),
  watchers_count: z.number().optional(),
  default_branch: z.string().nullable().optional(),
  open_issues_count: z.number().optional(),
  has_issues: z.boolean().optional(),
  has_wiki: z.boolean().optional(),
  issue_comment: z.boolean().nullable().optional(),
  can_comment: z.boolean().optional(),
  pull_requests_enabled: z.boolean().optional(),
  has_page: z.boolean().optional(),
  license: z.string().nullable().optional(),
  outsourced: z.boolean().optional(),
  project_creator: z.string().optional(),
  members: z.array(z.string()).optional(),
  pushed_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  parent: z.lazy(() => GiteeRepositorySchema).nullable().optional(),
  paas: z.string().nullable().optional(),
  assignees_number: z.number().optional(),
  testers_number: z.number().optional(),
  assignee: z.union([GiteeUserSchema, z.array(z.any()), z.null()]).optional(),
  enterprise: z.object({
    id: z.number(),
    name: z.string(),
    url: z.string().url(),
  }).nullable().optional(),
  permission: z.object({
    pull: z.boolean(),
    push: z.boolean(),
    admin: z.boolean(),
  }).optional(),
});

export const GiteeBranchSchema = z.object({
  name: z.string(),
  commit: z.object({
    sha: z.string(),
    url: z.string().url(),
  }),
  protected: z.boolean(),
  protection_url: z.string().url().optional(),
});

export const GiteeCompleteBranchSchema = GiteeBranchSchema.extend({
  _links: z.object({
    self: z.string().url(),
    html: z.string().url(),
  }),
});

export const GiteeCommitSchema = z.object({
  url: z.string().url(),
  sha: z.string(),
  html_url: z.string().url(),
  comments_url: z.string().url(),
  commit: z.object({
    url: z.string().url(),
    author: z.object({
      name: z.string(),
      email: z.string().email(),
      date: z.string(),
    }),
    committer: z.object({
      name: z.string(),
      email: z.string().email(),
      date: z.string(),
    }),
    message: z.string(),
    tree: z.object({
      url: z.string().url(),
      sha: z.string(),
    }),
  }),
  author: GiteeUserSchema.nullable(),
  committer: GiteeUserSchema.nullable(),
  parents: z.array(z.object({
    url: z.string().url(),
    sha: z.string(),
  })),
});

export const GiteeFileContentSchema = z.object({
  type: z.string(),
  encoding: z.string().optional(),
  size: z.number(),
  name: z.string(),
  path: z.string(),
  content: z.string().optional(),
  sha: z.string(),
  url: z.string().url(),
  html_url: z.string().url().nullable(),
  download_url: z.string().url().nullable(),
  _links: z.object({
    self: z.string().url(),
    html: z.string().url().nullable(),
  }),
});

export const GiteeDirectoryContentSchema = z.array(z.object({
  type: z.string(),
  size: z.number(),
  name: z.string(),
  path: z.string(),
  sha: z.string(),
  url: z.string().url(),
  html_url: z.string().url().nullable(),
  download_url: z.string().url().nullable(),
  _links: z.object({
    self: z.string().url(),
    html: z.string().url().nullable(),
  }),
}));

export const GiteeFileOperationResultSchema = z.object({
  content: GiteeFileContentSchema.nullable(),
  commit: z.object({
    sha: z.string(),
    author: z.object({
      name: z.string(),
      email: z.string().email(),
      date: z.string(),
    }),
    committer: z.object({
      name: z.string(),
      email: z.string().email(),
      date: z.string(),
    }),
    message: z.string(),
    tree: z.object({
      sha: z.string(),
      url: z.string().url(),
    }),
    parents: z.array(z.object({
      sha: z.string(),
      url: z.string().url(),
      html_url: z.string().url().optional(),
    })),
    url: z.string().url().optional(),
    html_url: z.string().url().optional(),
    comments_url: z.string().url().optional(),
  }),
});

export const GiteeIssueSchema = z.object({
  id: z.number(),
  url: z.string().url(),
  repository_url: z.string().url(),
  labels_url: z.string().url(),
  comments_url: z.string().url(),
  html_url: z.string().url(),
  number: z.union([z.number(), z.string()]), // 支持数字或字符串
  state: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  user: GiteeUserSchema,
  labels: z.array(z.object({
    id: z.number(),
    name: z.string(),
    color: z.string(),
  })),
  assignee: GiteeUserSchema.nullable(),
  milestone: z.object({
    id: z.number(),
    number: z.number(),
    state: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    creator: GiteeUserSchema,
    open_issues: z.number(),
    closed_issues: z.number(),
    created_at: z.string(),
    updated_at: z.string(),
    due_on: z.string().nullable(),
  }).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable().optional(),
  finished_at: z.string().nullable().optional(),
  plan_started_at: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  security_hole: z.boolean().optional(),
  // 添加 Gitee API 响应中可能包含的其他字段
  parent_url: z.string().nullable().optional(),
  parent_id: z.number().optional(),
  depth: z.number().optional(),
  comments: z.number().optional(),
  priority: z.number().optional(),
  issue_type: z.string().optional(),
  program: z.any().nullable().optional(),
  issue_state: z.string().optional(),
  branch: z.any().nullable().optional(),
  scheduled_time: z.number().optional(),
  collaborators: z.array(z.any()).optional(),
  repository: z.any().optional(),
  issue_type_detail: z.any().optional(),
  issue_state_detail: z.any().optional(),
  assignees: z.union([z.array(z.any()), z.string(), z.null()]).optional(),
});

export const GiteeIssueCommentSchema = z.object({
  id: z.number(),
  body: z.string(),
  user: GiteeUserSchema,
  created_at: z.string(),
  updated_at: z.string(),
  html_url: z.string().url().optional(), // 可能不存在
  target: z.object({  // target 是一个对象，不是字符串
    issue: z.object({
      id: z.number(),
      title: z.string(),
      number: z.string(), // Gitee API 返回的 number 是字符串格式
    }).optional(),
    pull_request: z.any().nullable(),
  }),
  source: z.any().nullable(), // source 可能为 null
});

// Type Exports
export type GiteeUser = z.infer<typeof GiteeUserSchema>;
export type GiteeRepository = z.infer<typeof GiteeRepositorySchema>;
export type GiteeBranch = z.infer<typeof GiteeBranchSchema>;
export type GiteeCompleteBranch = z.infer<typeof GiteeCompleteBranchSchema>;
export type GiteeCommit = z.infer<typeof GiteeCommitSchema>;
export type GiteeFileContent = z.infer<typeof GiteeFileContentSchema>;
export type GiteeDirectoryContent = z.infer<typeof GiteeDirectoryContentSchema>;
export type GiteeFileOperationResult = z.infer<typeof GiteeFileOperationResultSchema>;
export type GiteeIssue = z.infer<typeof GiteeIssueSchema>;
export type GiteeIssueComment = z.infer<typeof GiteeIssueCommentSchema>;