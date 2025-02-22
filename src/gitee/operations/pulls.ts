import { z } from "zod";
import { giteeRequest, validateOwnerName, validateRepositoryName, validateBranchName } from "../common/utils.js";
import { GiteePullRequestSchema } from "../common/types.js";

// Schema 定义
export const CreatePullRequestSchema = z.object({
  owner: z.string().describe("仓库所属空间地址 (企业、组织或个人的地址 path)"),
  repo: z.string().describe("仓库路径 (path)"),
  title: z.string().describe("Pull Request 标题"),
  head: z.string().describe("源分支的名称"),
  base: z.string().describe("目标分支的名称"),
  body: z.string().optional().describe("Pull Request 内容"),
  milestone_number: z.number().optional().describe("里程碑序号"),
  labels: z.array(z.string()).optional().describe("标签"),
  issue: z.string().optional().describe("相关的 Issue，格式为 #xxx"),
  assignees: z.array(z.string()).optional().describe("审查人员"),
  testers: z.array(z.string()).optional().describe("测试人员"),
  prune_source_branch: z.boolean().optional().describe("合并后是否删除源分支"),
});

export const ListPullRequestsSchema = z.object({
  owner: z.string().describe("仓库所属空间地址 (企业、组织或个人的地址 path)"),
  repo: z.string().describe("仓库路径 (path)"),
  state: z.enum(["open", "closed", "merged", "all"]).default("open").optional().describe("Pull Request 状态"),
  sort: z.enum(["created", "updated", "popularity", "long-running"]).default("created").optional().describe("排序字段"),
  direction: z.enum(["asc", "desc"]).default("desc").optional().describe("排序方向"),
  milestone: z.number().optional().describe("里程碑 ID"),
  labels: z.string().optional().describe("标签，多个标签以逗号分隔"),
  page: z.number().int().default(1).optional().describe("当前的页码"),
  per_page: z.number().int().min(1).max(100).optional().describe("每页的数量，最大为 100"),
});

export const GetPullRequestSchema = z.object({
  owner: z.string().describe("仓库所属空间地址 (企业、组织或个人的地址 path)"),
  repo: z.string().describe("仓库路径 (path)"),
  pull_number: z.number().describe("Pull Request 编号"),
});

export const UpdatePullRequestSchema = z.object({
  owner: z.string().describe("仓库所属空间地址 (企业、组织或个人的地址 path)"),
  repo: z.string().describe("仓库路径 (path)"),
  pull_number: z.number().describe("Pull Request 编号"),
  title: z.string().optional().describe("Pull Request 标题"),
  body: z.string().optional().describe("Pull Request 内容"),
  state: z.enum(["open", "closed"]).optional().describe("Pull Request 状态"),
  milestone_number: z.number().optional().describe("里程碑序号"),
  labels: z.array(z.string()).optional().describe("标签"),
  assignees: z.array(z.string()).optional().describe("审查人员"),
  testers: z.array(z.string()).optional().describe("测试人员"),
});

export const MergePullRequestSchema = z.object({
  owner: z.string().describe("仓库所属空间地址 (企业、组织或个人的地址 path)"),
  repo: z.string().describe("仓库路径 (path)"),
  pull_number: z.number().describe("Pull Request 编号"),
  merge_method: z.enum(["merge", "squash", "rebase"]).default("merge").optional().describe("合并方式"),
  prune_source_branch: z.boolean().optional().describe("合并后是否删除源分支"),
});

// 类型导出
export type CreatePullRequestOptions = z.infer<typeof CreatePullRequestSchema>;
export type ListPullRequestsOptions = z.infer<typeof ListPullRequestsSchema>;
export type GetPullRequestOptions = z.infer<typeof GetPullRequestSchema>;
export type UpdatePullRequestOptions = z.infer<typeof UpdatePullRequestSchema>;
export type MergePullRequestOptions = z.infer<typeof MergePullRequestSchema>;

// 函数实现
export async function createPullRequest(options: CreatePullRequestOptions) {
  const { owner, repo, ...rest } = options;
  const validatedOwner = validateOwnerName(owner);
  const validatedRepo = validateRepositoryName(repo);
  const validatedHead = validateBranchName(rest.head);
  const validatedBase = validateBranchName(rest.base);

  const url = `https://gitee.com/api/v5/repos/${validatedOwner}/${validatedRepo}/pulls`;
  const body = {
    ...rest,
    head: validatedHead,
    base: validatedBase,
  };

  const response = await giteeRequest(url, "POST", body);

  return GiteePullRequestSchema.parse(response);
}

export async function listPullRequests(
  owner: string,
  repo: string,
  options: Omit<ListPullRequestsOptions, "owner" | "repo">
) {
  owner = validateOwnerName(owner);
  repo = validateRepositoryName(repo);

  const url = new URL(`https://gitee.com/api/v5/repos/${owner}/${repo}/pulls`);
  
  // 添加查询参数
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.append(key, value.toString());
    }
  });

  const response = await giteeRequest(url.toString(), "GET");

  return z.array(GiteePullRequestSchema).parse(response);
}

export async function getPullRequest(
  owner: string,
  repo: string,
  pullNumber: number
) {
  owner = validateOwnerName(owner);
  repo = validateRepositoryName(repo);

  const url = `https://gitee.com/api/v5/repos/${owner}/${repo}/pulls/${pullNumber}`;
  const response = await giteeRequest(url, "GET");

  return GiteePullRequestSchema.parse(response);
}

export async function updatePullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  options: Omit<UpdatePullRequestOptions, "owner" | "repo" | "pull_number">
) {
  owner = validateOwnerName(owner);
  repo = validateRepositoryName(repo);

  const url = `https://gitee.com/api/v5/repos/${owner}/${repo}/pulls/${pullNumber}`;
  const response = await giteeRequest(url, "PATCH", options);

  return GiteePullRequestSchema.parse(response);
}

export async function mergePullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  options: Omit<MergePullRequestOptions, "owner" | "repo" | "pull_number">
) {
  owner = validateOwnerName(owner);
  repo = validateRepositoryName(repo);

  const url = `https://gitee.com/api/v5/repos/${owner}/${repo}/pulls/${pullNumber}/merge`;
  const response = await giteeRequest(url, "PUT", options);

  return response;
}
