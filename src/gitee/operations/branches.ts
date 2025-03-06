import { z } from "zod";
import { giteeRequest, validateBranchName, validateOwnerName, validateRepositoryName, getGiteeApiBaseUrl } from "../common/utils.js";
import { GiteeCompleteBranchSchema, GiteeBranchSchema } from "../common/types.js";

// Schema definitions
export const CreateBranchSchema = z.object({
  // 仓库所属空间地址 (企业、组织或个人的地址 path)
  owner: z.string().describe("Repository owner path (enterprise, organization, or personal path)"),
  // 仓库路径 (path)
  repo: z.string().describe("Repository path"),
  // 新创建的分支名称
  branch_name: z.string().describe("Name for the new branch"),
  // 起点名称，默认：master
  refs: z.string().default("master").describe("Source reference for the branch, default: master"),
});

export const ListBranchesSchema = z.object({
  // 仓库所属空间地址 (企业、组织或个人的地址 path)
  owner: z.string().describe("Repository owner path (enterprise, organization, or personal path)"),
  // 仓库路径 (path)
  repo: z.string().describe("Repository path"),
  // 排序字段
  sort: z.enum(["name", "updated"]).default("name").optional().describe("Sort field"),
  // 排序方向
  direction: z.enum(["asc", "desc"]).default("asc").optional().describe("Sort direction"),
  // 当前的页码
  page: z.number().int().default(1).optional().describe("Page number"),
  // 每页的数量，最大为 100
  per_page: z.number().int().min(1).max(100).optional().describe("Number of items per page, maximum 100"),
});

export const GetBranchSchema = z.object({
  // 仓库所属空间地址 (企业、组织或个人的地址 path)
  owner: z.string().describe("Repository owner path (enterprise, organization, or personal path)"),
  // 仓库路径 (path)
  repo: z.string().describe("Repository path"),
  // 分支名称
  branch: z.string().describe("Branch name"),
});

// Type exports
export type CreateBranchOptions = z.infer<typeof CreateBranchSchema>;
export type ListBranchesOptions = z.infer<typeof ListBranchesSchema>;
export type GetBranchOptions = z.infer<typeof GetBranchSchema>;

// Function implementations
export async function createBranchFromRef(
  owner: string,
  repo: string,
  branchName: string,
  refs: string = "master"
) {
  owner = validateOwnerName(owner);
  repo = validateRepositoryName(repo);
  branchName = validateBranchName(branchName);

  const url = `/repos/${owner}/${repo}/branches`;
  const body = {
    branch_name: branchName,
    refs: refs,
  };

  const response = await giteeRequest(url, "POST", body);
  return GiteeBranchSchema.parse(response);
}

export async function listBranches(
  owner: string,
  repo: string,
  sort?: string,
  direction?: string,
  page?: number,
  per_page?: number
) {
  owner = validateOwnerName(owner);
  repo = validateRepositoryName(repo);

  const url = new URL(`${getGiteeApiBaseUrl()}/repos/${owner}/${repo}/branches`);

  if (sort) {
    url.searchParams.append("sort", sort);
  }
  if (direction) {
    url.searchParams.append("direction", direction);
  }
  if (page !== undefined) {
    url.searchParams.append("page", page.toString());
  }
  if (per_page !== undefined) {
    url.searchParams.append("per_page", per_page.toString());
  }

  const response = await giteeRequest(url.toString());
  return z.array(GiteeBranchSchema).parse(response);
}

export async function getBranch(owner: string, repo: string, branch: string) {
  owner = validateOwnerName(owner);
  repo = validateRepositoryName(repo);
  branch = validateBranchName(branch);

  const url = `/repos/${owner}/${repo}/branches/${branch}`;
  const response = await giteeRequest(url);

  return GiteeCompleteBranchSchema.parse(response);
}
