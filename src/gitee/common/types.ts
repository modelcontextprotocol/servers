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

// Type Exports
export type GiteeUser = z.infer<typeof GiteeUserSchema>;
export type GiteeRepository = z.infer<typeof GiteeRepositorySchema>;
