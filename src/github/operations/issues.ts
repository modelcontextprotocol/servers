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

// Schemas for Label Operations
export const ListLabelsForIssueSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
  per_page: z.number().optional(),
  page: z.number().optional(),
});

export const AddLabelsToIssueSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
  labels: z.array(z.string()), // Can be string names or objects
});

export const SetLabelsForIssueSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
  labels: z.array(z.string()).optional(), // Can be string names or objects
});

export const RemoveLabelFromIssueSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
  name: z.string(),
});

export const RemoveAllLabelsFromIssueSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
});

export const ListLabelsForRepoSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  per_page: z.number().optional(),
  page: z.number().optional(),
});

export const CreateLabelSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  name: z.string(),
  color: z.string().optional(),
  description: z.string().optional(),
});

export const GetLabelSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  name: z.string(),
});

export const UpdateLabelSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  name: z.string(),
  new_name: z.string().optional(),
  color: z.string().optional(),
  description: z.string().optional(),
});

export const DeleteLabelSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  name: z.string(),
});

export const ListLabelsForMilestoneSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  milestone_number: z.number(),
  per_page: z.number().optional(),
  page: z.number().optional(),
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

// Functions for Label Operations

export async function listLabelsForIssue(
  owner: string,
  repo: string,
  issue_number: number,
  options: Omit<z.infer<typeof ListLabelsForIssueSchema>, "owner" | "repo" | "issue_number">
) {
  const urlParams: Record<string, string | undefined> = {
    page: options.page?.toString(),
    per_page: options.per_page?.toString(),
  };
  return githubRequest(
    buildUrl(`https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}/labels`, urlParams)
  );
}

export async function addLabelsToIssue(
  owner: string,
  repo: string,
  issue_number: number,
  labels: string[] | { name: string }[]
) {
  // The API expects labels in the body as an array of strings
  const labelNames = labels.map(label => typeof label === 'string' ? label : label.name);
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}/labels`,
    {
      method: "POST",
      body: { labels: labelNames },
    }
  );
}

export async function setLabelsForIssue(
  owner: string,
  repo: string,
  issue_number: number,
  labels?: string[] | { name: string }[]
) {
  const labelNames = labels?.map(label => typeof label === 'string' ? label : label.name);
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}/labels`,
    {
      method: "PUT",
      body: { labels: labelNames }, // Send empty array or null to remove all labels if needed, API doc implies empty array removes all
    }
  );
}

export async function removeLabelFromIssue(
  owner: string,
  repo: string,
  issue_number: number,
  name: string
) {
  // URL encode the label name in case it contains special characters
  const encodedName = encodeURIComponent(name);
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}/labels/${encodedName}`,
    {
      method: "DELETE",
    }
  );
}

export async function removeAllLabelsFromIssue(
  owner: string,
  repo: string,
  issue_number: number
) {
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}/labels`,
    {
      method: "DELETE",
    }
  );
}

export async function listLabelsForRepo(
  owner: string,
  repo: string,
  options: Omit<z.infer<typeof ListLabelsForRepoSchema>, "owner" | "repo">
) {
  const urlParams: Record<string, string | undefined> = {
    page: options.page?.toString(),
    per_page: options.per_page?.toString(),
  };
  return githubRequest(
    buildUrl(`https://api.github.com/repos/${owner}/${repo}/labels`, urlParams)
  );
}

export async function createLabel(
  owner: string,
  repo: string,
  options: Omit<z.infer<typeof CreateLabelSchema>, "owner" | "repo">
) {
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/labels`,
    {
      method: "POST",
      body: options,
    }
  );
}

export async function getLabel(
  owner: string,
  repo: string,
  name: string
) {
  const encodedName = encodeURIComponent(name);
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/labels/${encodedName}`
  );
}

export async function updateLabel(
  owner: string,
  repo: string,
  name: string,
  options: Omit<z.infer<typeof UpdateLabelSchema>, "owner" | "repo" | "name">
) {
  const encodedName = encodeURIComponent(name);
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/labels/${encodedName}`,
    {
      method: "PATCH",
      body: options,
    }
  );
}

export async function deleteLabel(
  owner: string,
  repo: string,
  name: string
) {
  const encodedName = encodeURIComponent(name);
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/labels/${encodedName}`,
    {
      method: "DELETE",
    }
  );
}

export async function listLabelsForMilestone(
  owner: string,
  repo: string,
  milestone_number: number,
  options: Omit<z.infer<typeof ListLabelsForMilestoneSchema>, "owner" | "repo" | "milestone_number">
) {
  const urlParams: Record<string, string | undefined> = {
    page: options.page?.toString(),
    per_page: options.per_page?.toString(),
  };
  return githubRequest(
    buildUrl(`https://api.github.com/repos/${owner}/${repo}/milestones/${milestone_number}/labels`, urlParams)
  );
}