import { z } from "zod";
import { githubRequest, buildUrl } from "../common/utils.js";

export const GetIssueSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
});

export const IssueCommentSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
  body: z.string(),
});

export const CreateIssueOptionsSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  assignees: z.array(z.string()).optional(),
  milestone: z.number().optional(),
  labels: z.array(z.string()).optional(),
});

export const AddSubIssueOptionsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
  sub_issue_id: z.number(),
  replace_parent: z.boolean().optional(),
});

export const CreateIssueSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  ...CreateIssueOptionsSchema.shape,
});

export const RemoveSubIssueOptionsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
  sub_issue_id: z.number(),
});

export const ReprioritizeSubIssueOptionsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
  sub_issue_id: z.number(),
  after_id: z.number().optional(),
  before_id: z.number().optional(),
});

export const ListIssuesOptionsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  direction: z.enum(["asc", "desc"]).optional(),
  labels: z.array(z.string()).optional(),
  page: z.number().optional(),
  per_page: z.number().optional(),
  since: z.string().optional(),
  sort: z.enum(["created", "updated", "comments"]).optional(),
  state: z.enum(["open", "closed", "all"]).optional(),
});

export const ListSubIssuesOptionsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
  page: z.number().optional(),
  per_page: z.number().optional(),
});

export const UpdateIssueOptionsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
  title: z.string().optional(),
  body: z.string().optional(),
  assignees: z.array(z.string()).optional(),
  milestone: z.number().optional(),
  labels: z.array(z.string()).optional(),
  state: z.enum(["open", "closed"]).optional(),
});

export async function getIssue(owner: string, repo: string, issue_number: number) {
  return githubRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}`);
}

export async function addIssueComment(
  owner: string,
  repo: string,
  issue_number: number,
  body: string
) {
  return githubRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}/comments`, {
    method: "POST",
    body: { body },
  });
}

export async function createIssue(
  owner: string,
  repo: string,
  options: z.infer<typeof CreateIssueOptionsSchema>
) {
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/issues`,
    {
      method: "POST",
      body: options,
    }
  );
}

export async function addSubIssue(
  owner: string,
  repo: string,
  issue_number: number,
  options: Omit<z.infer<typeof AddSubIssueOptionsSchema>, "owner" | "repo" | "issue_number">
) {
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}/sub_issues`,
    {
      method: "POST",
      body: options,
    }
  );
}
export async function reprioritizeSubIssue(
  owner: string,
  repo: string,
  issue_number: number,
  options: Omit<z.infer<typeof ReprioritizeSubIssueOptionsSchema>, "owner" | "repo" | "issue_number">
) {
  return githubRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}/sub_issues/priority`, { method: "PATCH", body: options });
}


export async function listIssues(
  owner: string,
  repo: string,
  options: Omit<z.infer<typeof ListIssuesOptionsSchema>, "owner" | "repo">
) {
  const urlParams: Record<string, string | undefined> = {
    direction: options.direction,
    labels: options.labels?.join(","),
    page: options.page?.toString(),
    per_page: options.per_page?.toString(),
    since: options.since,
    sort: options.sort,
    state: options.state
  };

  return githubRequest(
    buildUrl(`https://api.github.com/repos/${owner}/${repo}/issues`, urlParams)
  );
}

export async function listSubIssues(
  owner: string,
  repo: string,
  issue_number: number,
  options: Omit<z.infer<typeof ListSubIssuesOptionsSchema>, "owner" | "repo" | "issue_number">
) {
  const urlParams: Record<string, string | undefined> = {
    page: options.page?.toString(),
    per_page: options.per_page?.toString(),
  };

  return githubRequest(
    buildUrl(`https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}/sub_issues`, urlParams)
  );
}

export async function removeSubIssue(
  owner: string,
  repo: string,
  issue_number: number,
  options: Omit<z.infer<typeof RemoveSubIssueOptionsSchema>, "owner" | "repo" | "issue_number">
) {
  return githubRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}/sub_issue`, { method: "DELETE", body: options });
}

export async function updateIssue(
  owner: string,
  repo: string,
  issue_number: number,
  options: Omit<z.infer<typeof UpdateIssueOptionsSchema>, "owner" | "repo" | "issue_number">
) {
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}`,
    {
      method: "PATCH",
      body: options,
    }
  );
}