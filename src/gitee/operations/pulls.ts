import { z } from "zod";
import { giteeRequest, validateOwnerName, validateRepositoryName, validateBranchName, getGiteeApiBaseUrl } from "../common/utils.js";
import { GiteePullRequestSchema } from "../common/types.js";

// Schema definitions
export const CreatePullRequestSchema = z.object({
  // 仓库所属空间地址 (企业、组织或个人的地址 path)
  owner: z.string().describe("Repository owner path (enterprise, organization, or personal path)"),
  // 仓库路径 (path)
  repo: z.string().describe("Repository path"),
  // Pull Request 标题
  title: z.string().describe("Pull Request title"),
  // 源分支的名称
  head: z.string().describe("Source branch name"),
  // 目标分支的名称
  base: z.string().describe("Target branch name"),
  // Pull Request 内容
  body: z.string().optional().describe("Pull Request content"),
  // 里程碑序号
  milestone_number: z.number().optional().describe("Milestone number"),
  // 标签
  labels: z.array(z.string()).optional().describe("Labels"),
  // 相关的 Issue，格式为 #xxx
  issue: z.string().optional().describe("Related issue, format: #xxx"),
  // 审查人员
  assignees: z.array(z.string()).optional().describe("Reviewers"),
  // 测试人员
  testers: z.array(z.string()).optional().describe("Testers"),
  // 合并后是否删除源分支
  prune_source_branch: z.boolean().optional().describe("Whether to delete the source branch after merging"),
});

export const ListPullRequestsSchema = z.object({
  // 仓库所属空间地址 (企业、组织或个人的地址 path)
  owner: z.string().describe("Repository owner path (enterprise, organization, or personal path)"),
  // 仓库路径 (path)
  repo: z.string().describe("Repository path"),
  // Pull Request 状态
  state: z.enum(["open", "closed", "merged", "all"]).default("open").optional().describe("Pull Request state"),
  // 排序字段
  sort: z.enum(["created", "updated", "popularity", "long-running"]).default("created").optional().describe("Sort field"),
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
});

export const GetPullRequestSchema = z.object({
  // 仓库所属空间地址 (企业、组织或个人的地址 path)
  owner: z.string().describe("Repository owner path (enterprise, organization, or personal path)"),
  // 仓库路径 (path)
  repo: z.string().describe("Repository path"),
  // Pull Request 编号
  pull_number: z.number().describe("Pull Request number"),
});

export const UpdatePullRequestSchema = z.object({
  // 仓库所属空间地址 (企业、组织或个人的地址 path)
  owner: z.string().describe("Repository owner path (enterprise, organization, or personal path)"),
  // 仓库路径 (path)
  repo: z.string().describe("Repository path"),
  // Pull Request 编号
  pull_number: z.number().describe("Pull Request number"),
  // Pull Request 标题
  title: z.string().optional().describe("Pull Request title"),
  // Pull Request 内容
  body: z.string().optional().describe("Pull Request content"),
  // Pull Request 状态
  state: z.enum(["open", "closed"]).optional().describe("Pull Request state"),
  // 里程碑序号
  milestone_number: z.number().optional().describe("Milestone number"),
  // 标签
  labels: z.array(z.string()).optional().describe("Labels"),
  // 审查人员
  assignees: z.array(z.string()).optional().describe("Reviewers"),
  // 测试人员
  testers: z.array(z.string()).optional().describe("Testers"),
});

export const MergePullRequestSchema = z.object({
  // 仓库所属空间地址 (企业、组织或个人的地址 path)
  owner: z.string().describe("Repository owner path (enterprise, organization, or personal path)"),
  // 仓库路径 (path)
  repo: z.string().describe("Repository path"),
  // Pull Request 编号
  pull_number: z.number().describe("Pull Request number"),
  // 合并方式
  merge_method: z.enum(["merge", "squash", "rebase"]).default("merge").optional().describe("Merge method"),
  // 合并后是否删除源分支
  prune_source_branch: z.boolean().optional().describe("Whether to delete the source branch after merging"),
});

// Type exports
export type CreatePullRequestOptions = z.infer<typeof CreatePullRequestSchema>;
export type ListPullRequestsOptions = z.infer<typeof ListPullRequestsSchema>;
export type GetPullRequestOptions = z.infer<typeof GetPullRequestSchema>;
export type UpdatePullRequestOptions = z.infer<typeof UpdatePullRequestSchema>;
export type MergePullRequestOptions = z.infer<typeof MergePullRequestSchema>;

// Function implementations
export async function createPullRequest(options: CreatePullRequestOptions) {
  const { owner, repo, ...rest } = options;
  const validatedOwner = validateOwnerName(owner);
  const validatedRepo = validateRepositoryName(repo);
  const validatedHead = validateBranchName(rest.head);
  const validatedBase = validateBranchName(rest.base);

  const url = `/repos/${validatedOwner}/${validatedRepo}/pulls`;
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

  const url = new URL(`${getGiteeApiBaseUrl()}/repos/${owner}/${repo}/pulls`);

  // Add query parameters
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

  const url = `/repos/${owner}/${repo}/pulls/${pullNumber}`;
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

  const url = `/repos/${owner}/${repo}/pulls/${pullNumber}`;
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

  const url = `/repos/${owner}/${repo}/pulls/${pullNumber}/merge`;
  const response = await giteeRequest(url, "PUT", options);

  return response;
}
