import { z } from "zod";
import { giteeRequest, validateOwnerName, validateRepositoryName } from "../common/utils.js";
import { GiteeRepositorySchema } from "../common/types.js";

// Schema 定义
export const CreateRepositorySchema = z.object({
  name: z.string().describe("仓库名称"),
  description: z.string().optional().describe("仓库描述"),
  homepage: z.string().optional().describe("主页地址"),
  private: z.boolean().default(false).optional().describe("是否私有"),
  has_issues: z.boolean().default(true).optional().describe("是否开启 Issue 功能"),
  has_wiki: z.boolean().default(true).optional().describe("是否开启 Wiki 功能"),
  auto_init: z.boolean().default(false).optional().describe("是否自动初始化仓库"),
  gitignore_template: z.string().optional().describe("Git Ignore 模板"),
  license_template: z.string().optional().describe("License 模板"),
  path: z.string().optional().describe("仓库路径"),
});

export const ForkRepositorySchema = z.object({
  owner: z.string().describe("仓库所属空间地址 (企业、组织或个人的地址 path)"),
  repo: z.string().describe("仓库路径 (path)"),
  organization: z.string().optional().describe("组织空间地址，不传默认为个人"),
});

// 类型导出
export type CreateRepositoryOptions = z.infer<typeof CreateRepositorySchema>;
export type ForkRepositoryOptions = z.infer<typeof ForkRepositorySchema>;

// 函数实现
export async function createRepository(options: CreateRepositoryOptions) {
  try {
    console.log('创建仓库参数:', JSON.stringify(options));
    const url = "https://gitee.com/api/v5/user/repos";
    const response = await giteeRequest(url, "POST", options);
    console.log('创建仓库响应:', JSON.stringify(response));

    // 尝试解析响应
    try {
      return GiteeRepositorySchema.parse(response);
    } catch (parseError) {
      console.error('解析仓库响应失败:', parseError);
      // 返回原始响应，避免解析错误
      return response;
    }
  } catch (error) {
    console.error('创建仓库请求失败:', error);
    throw error;
  }
}

export async function forkRepository(
  owner: string,
  repo: string,
  organization?: string
) {
  owner = validateOwnerName(owner);
  repo = validateRepositoryName(repo);

  const url = `https://gitee.com/api/v5/repos/${owner}/${repo}/forks`;
  const body: Record<string, string> = {};

  if (organization) {
    body.organization = validateOwnerName(organization);
  }

  const response = await giteeRequest(url, "POST", body);

  return GiteeRepositorySchema.parse(response);
}