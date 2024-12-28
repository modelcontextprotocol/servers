import { z } from "zod";
import {
  githubRequest,
  validateBranchName,
  validateOwnerName,
  validateRepositoryName,
  checkBranchExists,
} from "../common/utils.js";
import { 
  GitHubIssueAssigneeSchema, 
  GitHubRepositorySchema 
} from "../common/types.js";
import {
  GitHubError,
  GitHubValidationError,
  GitHubResourceNotFoundError,
  GitHubConflictError,
} from "../common/errors.js";

const GITHUB_TITLE_MAX_LENGTH = 256;
const GITHUB_BODY_MAX_LENGTH = 65536;

export const RepositoryParamsSchema = z.object({
  owner: z.string().min(1).transform(validateOwnerName),
  repo: z.string().min(1).transform(validateRepositoryName),
});

export const GitHubPullRequestStateSchema = z.enum([
  "open",
  "closed",
  "merged",
  "draft"
]);

export const GitHubPullRequestSortSchema = z.enum([
  "created",
  "updated",
  "popularity",
  "long-running"
]);

export const GitHubDirectionSchema = z.enum([
  "asc",
  "desc"
]);

export const GitHubPullRequestRefSchema = z.object({
  label: z.string(),
  ref: z.string().min(1).transform(validateBranchName),
  sha: z.string().length(40),
  user: GitHubIssueAssigneeSchema,
  repo: GitHubRepositorySchema,
});

export const GitHubPullRequestSchema = z.object({
  url: z.string().url(),
  id: z.number().positive(),
  node_id: z.string(),
  html_url: z.string().url(),
  diff_url: z.string().url(),
  patch_url: z.string().url(),
  issue_url: z.string().url(),
  number: z.number().positive(),
  state: GitHubPullRequestStateSchema,
  locked: z.boolean(),
  title: z.string().max(GITHUB_TITLE_MAX_LENGTH),
  user: GitHubIssueAssigneeSchema,
  body: z.string().max(GITHUB_BODY_MAX_LENGTH).nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  closed_at: z.string().datetime().nullable(),
  merged_at: z.string().datetime().nullable(),
  merge_commit_sha: z.string().length(40).nullable(),
  assignee: GitHubIssueAssigneeSchema.nullable(),
  assignees: z.array(GitHubIssueAssigneeSchema),
  requested_reviewers: z.array(GitHubIssueAssigneeSchema),
  labels: z.array(z.object({
    name: z.string(),
    color: z.string().regex(/^[0-9a-fA-F]{6}$/),
    description: z.string().nullable(),
  })),
  head: GitHubPullRequestRefSchema,
  base: GitHubPullRequestRefSchema,
});

export const ListPullRequestsOptionsSchema = z.object({
  state: GitHubPullRequestStateSchema.optional(),
  head: z.string().transform(validateBranchName).optional(),
  base: z.string().transform(validateBranchName).optional(),
  sort: GitHubPullRequestSortSchema.optional(),
  direction: GitHubDirectionSchema.optional(),
  per_page: z.number().min(1).max(100).optional(),
  page: z.number().min(1).optional(),
});

export const CreatePullRequestOptionsSchema = z.object({
  title: z.string().max(GITHUB_TITLE_MAX_LENGTH),
  body: z.string().max(GITHUB_BODY_MAX_LENGTH).optional(),
  head: z.string().min(1).transform(validateBranchName),
  base: z.string().min(1).transform(validateBranchName),
  maintainer_can_modify: z.boolean().optional(),
  draft: z.boolean().optional(),
});

export const CreatePullRequestSchema = RepositoryParamsSchema.extend({
  ...CreatePullRequestOptionsSchema.shape,
});

export type RepositoryParams = z.infer<typeof RepositoryParamsSchema>;
export type CreatePullRequestOptions = z.infer<typeof CreatePullRequestOptionsSchema>;
export type ListPullRequestsOptions = z.infer<typeof ListPullRequestsOptionsSchema>;
export type GitHubPullRequest = z.infer<typeof GitHubPullRequestSchema>;
export type GitHubPullRequestRef = z.infer<typeof GitHubPullRequestRefSchema>;

async function validatePullRequestBranches(
  owner: string,
  repo: string,
  head: string,
  base: string
): Promise<void> {
  const [headExists, baseExists] = await Promise.all([
    checkBranchExists(owner, repo, head),
    checkBranchExists(owner, repo, base),
  ]);

  if (!headExists) {
    throw new GitHubResourceNotFoundError(`Branch '${head}' not found`);
  }

  if (!baseExists) {
    throw new GitHubResourceNotFoundError(`Branch '${base}' not found`);
  }

  if (head === base) {
    throw new GitHubValidationError(
      "Head and base branches cannot be the same",
      422,
      { message: "Head and base branches must be different" }
    );
  }
}

async function checkForExistingPullRequest(
  owner: string,
  repo: string,
  head: string,
  base: string
): Promise<void> {
  const existingPRs = await listPullRequests({
    owner,
    repo,
    head,
    base,
    state: "open",
  });

  if (existingPRs.length > 0) {
    throw new GitHubConflictError(
      `A pull request already exists for ${head} into ${base}`
    );
  }
}

export async function createPullRequest(
  params: z.infer<typeof CreatePullRequestSchema>
): Promise<GitHubPullRequest> {
  const { owner, repo, ...options } = CreatePullRequestSchema.parse(params);

  try {
    await validatePullRequestBranches(owner, repo, options.head, options.base);
    await checkForExistingPullRequest(owner, repo, options.head, options.base);

    const response = await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        method: "POST",
        body: options,
      }
    );

    return GitHubPullRequestSchema.parse(response);
  } catch (error) {
    if (error instanceof GitHubError) {
      throw error;
    }
    if (error instanceof z.ZodError) {
      throw new GitHubValidationError(
        "Invalid pull request data",
        422,
        { errors: error.errors }
      );
    }
    throw error;
  }
}

export async function getPullRequest(
  params: RepositoryParams & { pullNumber: number }
): Promise<GitHubPullRequest> {
  const { owner, repo, pullNumber } = z.object({
    ...RepositoryParamsSchema.shape,
    pullNumber: z.number().positive(),
  }).parse(params);

  try {
    const response = await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`
    );

    return GitHubPullRequestSchema.parse(response);
  } catch (error) {
    if (error instanceof GitHubError) {
      throw error;
    }
    if (error instanceof z.ZodError) {
      throw new GitHubValidationError(
        "Invalid pull request response data",
        422,
        { errors: error.errors }
      );
    }
    throw error;
  }
}

export async function listPullRequests(
  params: RepositoryParams & Partial<ListPullRequestsOptions>
): Promise<GitHubPullRequest[]> {
  const { owner, repo, ...options } = z.object({
    ...RepositoryParamsSchema.shape,
    ...ListPullRequestsOptionsSchema.partial().shape,
  }).parse(params);

  try {
    const url = new URL(`https://api.github.com/repos/${owner}/${repo}/pulls`);
    
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, value.toString());
      }
    });

    const response = await githubRequest(url.toString());
    return z.array(GitHubPullRequestSchema).parse(response);
  } catch (error) {
    if (error instanceof GitHubError) {
      throw error;
    }
    if (error instanceof z.ZodError) {
      throw new GitHubValidationError(
        "Invalid pull request list response data",
        422,
        { errors: error.errors }
      );
    }
    throw error;
  }
}