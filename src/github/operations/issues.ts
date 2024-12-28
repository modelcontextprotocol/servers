import { z } from "zod";
import { githubRequest, buildUrl } from "../common/utils.js";
import {
  GitHubIssueSchema,
  GitHubLabelSchema,
  GitHubIssueAssigneeSchema,
  GitHubMilestoneSchema,
} from "../common/types.js";

// Schema definitions
export const CreateIssueOptionsSchema = z.object({
  title: z.string().describe("Issue title"),
  body: z.string().optional().describe("Issue body/description"),
  assignees: z.array(z.string()).optional().describe("Array of usernames to assign"),
  milestone: z.number().optional().describe("Milestone number to assign"),
  labels: z.array(z.string()).optional().describe("Array of label names"),
});

export const CreateIssueSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  title: z.string().describe("Issue title"),
  body: z.string().optional().describe("Issue body/description"),
  assignees: z.array(z.string()).optional().describe("Array of usernames to assign"),
  labels: z.array(z.string()).optional().describe("Array of label names"),
  milestone: z.number().optional().describe("Milestone number to assign"),
});

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

// Type exports
export type CreateIssueOptions = z.infer<typeof CreateIssueOptionsSchema>;
export type ListIssuesOptions = z.infer<typeof ListIssuesOptionsSchema>;
export type UpdateIssueOptions = z.infer<typeof UpdateIssueOptionsSchema>;

// Function implementations
export async function createIssue(
  owner: string,
  repo: string,
  options: CreateIssueOptions
) {
  const response = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/issues`,
    {
      method: "POST",
      body: options,
    }
  );

  return GitHubIssueSchema.parse(response);
}

export async function listIssues(
  owner: string,
  repo: string,
  options: Omit<ListIssuesOptions, 'owner' | 'repo'>
) {
  const url = buildUrl(`https://api.github.com/repos/${owner}/${repo}/issues`, options);
  const response = await githubRequest(url);
  return z.array(GitHubIssueSchema).parse(response);
}

export async function updateIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  options: Omit<UpdateIssueOptions, 'owner' | 'repo' | 'issue_number'>
) {
  const response = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
    {
      method: "PATCH",
      body: options
    }
  );

  return GitHubIssueSchema.parse(response);
}

export async function addIssueComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
) {
  const response = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      body: { body }
    }
  );

  return z.object({
    id: z.number(),
    node_id: z.string(),
    url: z.string(),
    html_url: z.string(),
    body: z.string(),
    user: GitHubIssueAssigneeSchema,
    created_at: z.string(),
    updated_at: z.string(),
  }).parse(response);
}

export async function getIssue(
  owner: string,
  repo: string,
  issueNumber: number
) {
  const response = await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`
  );

  return GitHubIssueSchema.parse(response);
}
