import { z } from "zod";
import { giteeRequest, validateBranchName, validateOwnerName, validateRepositoryName } from "../common/utils.js";
import { GiteeCompleteBranchSchema, GiteeBranchSchema } from "../common/types.js";

// Schema 定义
export const CreateBranchSchema = z.object({
  owner: z.string().describe("仓库所属空间地址 (企业、组织或个人的地址 path)"),
  repo: z.string().describe("仓库路径 (path)"),
  branch_name: z.string().describe("新创建的分支名称"),
  refs: z.string().default("master").describe("起点名称，默认：master"),
});

export const ListBranchesSchema = z.object({
  owner: z.string().describe("仓库所属空间地址 (企业、组织或个人的地址 path)"),
  repo: z.string().describe("仓库路径 (path)"),
  sort: z.enum(["name", "updated"]).default("name").optional().describe("排序字段"),
  direction: z.enum(["asc", "desc"]).default("asc").optional().describe("排序方向"),
  page: z.number().int().default(1).optional().describe("当前的页码"),
  per_page: z.number().int().min(1).max(100).optional().describe("每页的数量，最大为 100"),
});

export const GetBranchSchema = z.object({
  owner: z.string().describe("仓库所属空间地址 (企业、组织或个人的地址 path)"),
  repo: z.string().describe("仓库路径 (path)"),
  branch: z.string().describe("分支名称"),
});

// 类型导出
export type CreateBranchOptions = z.infer<typeof CreateBranchSchema>;
export type ListBranchesOptions = z.infer<typeof ListBranchesSchema>;
export type GetBranchOptions = z.infer<typeof GetBranchSchema>;

// 函数实现
export async function createBranchFromRef(
  owner: string,
  repo: string,
  branchName: string,
  refs: string = "master"
) {
  owner = validateOwnerName(owner);
  repo = validateRepositoryName(repo);
  branchName = validateBranchName(branchName);

  const url = `https://gitee.com/api/v5/repos/${owner}/${repo}/branches`;
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

  const url = new URL(`https://gitee.com/api/v5/repos/${owner}/${repo}/branches`);
  
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

  const url = `https://gitee.com/api/v5/repos/${owner}/${repo}/branches/${branch}`;
  const response = await giteeRequest(url);
  
  return GiteeCompleteBranchSchema.parse(response);
}
