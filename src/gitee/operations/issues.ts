import { z } from "zod";
import { giteeRequest, validateOwnerName, validateRepositoryName } from "../common/utils.js";
import { GiteeIssueCommentSchema, GiteeIssueSchema } from "../common/types.js";

// Schema 定义
export const CreateIssueSchema = z.object({
  owner: z.string().describe("仓库所属空间地址 (企业、组织或个人的地址 path)"),
  repo: z.string().describe("仓库路径 (path)"),
  title: z.string().describe("Issue 标题"),
  body: z.string().optional().describe("Issue 内容"),
  assignees: z.array(z.string()).optional().describe("Issue 分配的用户"),
  milestone: z.number().optional().describe("里程碑 ID"),
  labels: z.array(z.string()).optional().describe("标签"),
  security_hole: z.boolean().optional().describe("是否是私有 Issue，默认为 false"),
});

export const ListIssuesOptionsSchema = z.object({
  owner: z.string().describe("仓库所属空间地址 (企业、组织或个人的地址 path)"),
  repo: z.string().describe("仓库路径 (path)"),
  state: z.enum(["open", "closed", "all"]).default("open").optional().describe("Issue 状态"),
  sort: z.enum(["created", "updated", "comments"]).default("created").optional().describe("排序字段"),
  direction: z.enum(["asc", "desc"]).default("desc").optional().describe("排序方向"),
  milestone: z.number().optional().describe("里程碑 ID"),
  labels: z.string().optional().describe("标签，多个标签以逗号分隔"),
  page: z.number().int().default(1).optional().describe("当前的页码"),
  per_page: z.number().int().min(1).max(100).optional().describe("每页的数量，最大为 100"),
  assignee: z.string().optional().describe("筛选指定用户负责的 Issue"),
  creator: z.string().optional().describe("筛选指定用户创建的 Issue"),
  program: z.string().optional().describe("筛选指定项目的 Issue"),
});

export const GetIssueSchema = z.object({
  owner: z.string().describe("仓库所属空间地址 (企业、组织或个人的地址 path)"),
  repo: z.string().describe("仓库路径 (path)"),
  issue_number: z.union([z.number(), z.string()]).describe("Issue 编号"),
});

export const UpdateIssueOptionsSchema = z.object({
  owner: z.string().describe("仓库所属空间地址 (企业、组织或个人的地址 path)"),
  repo: z.string().describe("仓库路径 (path)"),
  issue_number: z.union([z.number(), z.string()]).describe("Issue 编号"),
  title: z.string().optional().describe("Issue 标题"),
  body: z.string().optional().describe("Issue 内容"),
  assignees: z.array(z.string()).optional().describe("Issue 分配的用户"),
  milestone: z.number().optional().describe("里程碑 ID"),
  labels: z.array(z.string()).optional().describe("标签"),
  state: z.enum(["open", "closed", "progressing"]).optional().describe("Issue 状态"),
});

export const IssueCommentSchema = z.object({
  owner: z.string().describe("仓库所属空间地址 (企业、组织或个人的地址 path)"),
  repo: z.string().describe("仓库路径 (path)"),
  issue_number: z.union([z.number(), z.string()]).describe("Issue 编号"),
  body: z.string().describe("评论内容"),
});

// 类型导出
export type CreateIssueOptions = z.infer<typeof CreateIssueSchema>;
export type ListIssuesOptions = z.infer<typeof ListIssuesOptionsSchema>;
export type GetIssueOptions = z.infer<typeof GetIssueSchema>;
export type UpdateIssueOptions = z.infer<typeof UpdateIssueOptionsSchema>;
export type IssueCommentOptions = z.infer<typeof IssueCommentSchema>;

// 函数实现
export async function createIssue(
  owner: string,
  repo: string,
  options: Omit<CreateIssueOptions, "owner" | "repo">
) {
  owner = validateOwnerName(owner);
  repo = validateRepositoryName(repo);

  // 创建请求体
  const body: Record<string, any> = {
    ...options,
    repo: repo,
  };

  // 如果 assignees 是数组，将其转换为逗号分隔的字符串
  if (Array.isArray(body.assignees) && body.assignees.length > 0) {
    body.assignees = body.assignees.join(',');
  } else if (Array.isArray(body.assignees) && body.assignees.length === 0) {
    // 如果是空数组，删除该字段
    delete body.assignees;
  }

  // 如果 labels 是数组，将其转换为逗号分隔的字符串
  if (Array.isArray(body.labels) && body.labels.length > 0) {
    body.labels = body.labels.join(',');
  } else if (Array.isArray(body.labels) && body.labels.length === 0) {
    // 如果是空数组，删除该字段
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
  
  // 添加查询参数
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

  // 创建请求体
  const body: Record<string, any> = { 
    ...options,
    repo: repo  // 添加 repo 作为请求体参数
  };

  // 如果 assignees 是数组，将其转换为逗号分隔的字符串
  if (Array.isArray(body.assignees) && body.assignees.length > 0) {
    body.assignees = body.assignees.join(',');
  } else if (Array.isArray(body.assignees) && body.assignees.length === 0) {
    // 如果是空数组，删除该字段
    delete body.assignees;
  }

  // 如果 labels 是数组，将其转换为逗号分隔的字符串
  if (Array.isArray(body.labels) && body.labels.length > 0) {
    body.labels = body.labels.join(',');
  } else if (Array.isArray(body.labels) && body.labels.length === 0) {
    // 如果是空数组，删除该字段
    delete body.labels;
  }

  // 注意：Gitee API 的更新 Issue 接口中，repo 是作为表单参数传递的，不是路径参数
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
