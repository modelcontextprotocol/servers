import { z } from "zod";
import { giteeRequest, validateOwnerName, validateRepositoryName } from "../common/utils.js";
import { GiteeIssueCommentSchema, GiteeIssueSchema } from "../common/types.js";

// Schema definitions
export const CreateIssueSchema = z.object({
  // 仓库所属空间地址 (企业、组织或个人的地址 path)
  owner: z.string().describe("Repository owner path (enterprise, organization, or personal path)"),
  // 仓库路径 (path)
  repo: z.string().describe("Repository path"),
  // Issue 标题
  title: z.string().describe("Issue title"),
  // Issue 内容
  body: z.string().optional().describe("Issue content"),
  // Issue 分配的用户
  assignees: z.array(z.string()).optional().describe("Users assigned to the issue"),
  // 里程碑 ID
  milestone: z.number().optional().describe("Milestone ID"),
  // 标签
  labels: z.array(z.string()).optional().describe("Labels"),
  // 是否是私有 Issue，默认为 false
  security_hole: z.boolean().optional().describe("Whether the issue is private, default is false"),
});

export const ListIssuesOptionsSchema = z.object({
  // 仓库所属空间地址 (企业、组织或个人的地址 path)
  owner: z.string().describe("Repository owner path (enterprise, organization, or personal path)"),
  // 仓库路径 (path)
  repo: z.string().describe("Repository path"),
  // Issue 状态
  state: z.enum(["open", "closed", "all"]).default("open").optional().describe("Issue state"),
  // 排序字段
  sort: z.enum(["created", "updated", "comments"]).default("created").optional().describe("Sort field"),
  // 排序方向
  direction: z.enum(["asc", "desc"]).default("desc").optional().describe("Sort direction"),
  // 里程碑 ID
  milestone: z.number().optional().describe("Milestone ID"),
  // 标签，多个标签以逗号分隔
  labels: z.string().optional().describe("Labels, multiple labels separated by commas"),
  // 当前的页码
  page: z.number().int().default(1).optional().describe("Page number"),
  // 每页的数量，最大为 100
  per_page: z.number().int().min(1).max(100).optional().describe("Number of items per page, maximum 100"),
  // 筛选指定用户负责的 Issue
  assignee: z.string().optional().describe("Filter issues assigned to a specific user"),
  // 筛选指定用户创建的 Issue
  creator: z.string().optional().describe("Filter issues created by a specific user"),
  // 筛选指定项目的 Issue
  program: z.string().optional().describe("Filter issues for a specific program"),
});

export const GetIssueSchema = z.object({
  // 仓库所属空间地址 (企业、组织或个人的地址 path)
  owner: z.string().describe("Repository owner path (enterprise, organization, or personal path)"),
  // 仓库路径 (path)
  repo: z.string().describe("Repository path"),
  // Issue 编号
  issue_number: z.union([z.number(), z.string()]).describe("Issue number"),
});

export const UpdateIssueOptionsSchema = z.object({
  // 仓库所属空间地址 (企业、组织或个人的地址 path)
  owner: z.string().describe("Repository owner path (enterprise, organization, or personal path)"),
  // 仓库路径 (path)
  repo: z.string().describe("Repository path"),
  // Issue 编号
  issue_number: z.union([z.number(), z.string()]).describe("Issue number"),
  // Issue 标题
  title: z.string().optional().describe("Issue title"),
  // Issue 内容
  body: z.string().optional().describe("Issue content"),
  // Issue 分配的用户
  assignees: z.array(z.string()).optional().describe("Users assigned to the issue"),
  // 里程碑 ID
  milestone: z.number().optional().describe("Milestone ID"),
  // 标签
  labels: z.array(z.string()).optional().describe("Labels"),
  // Issue 状态
  state: z.enum(["open", "closed", "progressing"]).optional().describe("Issue state"),
});

export const IssueCommentSchema = z.object({
  // 仓库所属空间地址 (企业、组织或个人的地址 path)
  owner: z.string().describe("Repository owner path (enterprise, organization, or personal path)"),
  // 仓库路径 (path)
  repo: z.string().describe("Repository path"),
  // Issue 编号
  issue_number: z.union([z.number(), z.string()]).describe("Issue number"),
  // 评论内容
  body: z.string().describe("Comment content"),
});

// Type exports
export type CreateIssueOptions = z.infer<typeof CreateIssueSchema>;
export type ListIssuesOptions = z.infer<typeof ListIssuesOptionsSchema>;
export type GetIssueOptions = z.infer<typeof GetIssueSchema>;
export type UpdateIssueOptions = z.infer<typeof UpdateIssueOptionsSchema>;
export type IssueCommentOptions = z.infer<typeof IssueCommentSchema>;

// Function implementations
export async function createIssue(
  owner: string,
  repo: string,
  options: Omit<CreateIssueOptions, "owner" | "repo">
) {
  owner = validateOwnerName(owner);
  repo = validateRepositoryName(repo);

  // Create the request body
  const body: Record<string, any> = {
    ...options,
    repo: repo,
  };

  // If `assignees` is an array, convert it to a comma-separated string.
  if (Array.isArray(body.assignees) && body.assignees.length > 0) {
    body.assignees = body.assignees.join(',');
  } else if (Array.isArray(body.assignees) && body.assignees.length === 0) {
    // If `assignees` is an empty array, delete the field.
    delete body.assignees;
  }

  // If `labels` is an array, convert it to a comma-separated string.
  if (Array.isArray(body.labels) && body.labels.length > 0) {
    body.labels = body.labels.join(',');
  } else if (Array.isArray(body.labels) && body.labels.length === 0) {
    // If `labels` is an empty array, delete the field.
    delete body.labels;
  }

  const url = `https://gitee.com/api/v5/repos/${owner}/${repo}/issues`;
  const response = await giteeRequest(url, "POST", body);

  return GiteeIssueSchema.parse(response);
}

export async function listIssues(
  owner: string,
  repo: string,
  options: Omit<ListIssuesOptions, "owner" | "repo">
) {
  owner = validateOwnerName(owner);
  repo = validateRepositoryName(repo);

  const url = new URL(`https://gitee.com/api/v5/repos/${owner}/${repo}/issues`);

  // Add query parameters
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.append(key, value.toString());
    }
  });

  const response = await giteeRequest(url.toString());

  return z.array(GiteeIssueSchema).parse(response);
}

export async function getIssue(
  owner: string,
  repo: string,
  issueNumber: number | string
) {
  owner = validateOwnerName(owner);
  repo = validateRepositoryName(repo);

  const url = `https://gitee.com/api/v5/repos/${owner}/${repo}/issues/${issueNumber}`;
  const response = await giteeRequest(url);

  return GiteeIssueSchema.parse(response);
}

export async function updateIssue(
  owner: string,
  repo: string,
  issueNumber: number | string,
  options: Omit<UpdateIssueOptions, "owner" | "repo" | "issue_number">
) {
  owner = validateOwnerName(owner);
  repo = validateRepositoryName(repo);

  // Create the request body
  const body: Record<string, any> = {
    ...options,
    repo: repo  // Add repo as a request body parameter
  };

  // If `assignees` is an array, convert it to a comma-separated string.
  if (Array.isArray(body.assignees) && body.assignees.length > 0) {
    body.assignees = body.assignees.join(',');
  } else if (Array.isArray(body.assignees) && body.assignees.length === 0) {
    // If `assignees` is an empty array, delete the field.
    delete body.assignees;
  }

  // If `labels` is an array, convert it to a comma-separated string.
  if (Array.isArray(body.labels) && body.labels.length > 0) {
    body.labels = body.labels.join(',');
  } else if (Array.isArray(body.labels) && body.labels.length === 0) {
    // If `labels` is an empty array, delete the field.
    delete body.labels;
  }

  // Note: In the Gitee API's update issue interface, `repo` is passed as a form parameter, not as a path parameter.
  const url = `https://gitee.com/api/v5/repos/${owner}/issues/${issueNumber}`;
  const response = await giteeRequest(url, "PATCH", body);

  return GiteeIssueSchema.parse(response);
}

export async function addIssueComment(
  owner: string,
  repo: string,
  issueNumber: number | string,
  body: string
) {
  owner = validateOwnerName(owner);
  repo = validateRepositoryName(repo);

  const url = `https://gitee.com/api/v5/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
  const response = await giteeRequest(url, "POST", { body });

  return GiteeIssueCommentSchema.parse(response);
}
