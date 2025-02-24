import { z } from "zod";
import { giteeRequest, validateOwnerName, validateRepositoryName } from "../common/utils.js";
import { GiteeRepositorySchema } from "../common/types.js";

// Schema definitions
export const CreateRepositorySchema = z.object({
  // 仓库名称
  name: z.string().describe("Repository name"),
  // 仓库描述
  description: z.string().optional().describe("Repository description"),
  // 主页地址
  homepage: z.string().optional().describe("Homepage URL"),
  // 是否私有
  private: z.boolean().default(false).optional().describe("Whether the repository is private"),
  // 是否开启 Issue 功能
  has_issues: z.boolean().default(true).optional().describe("Whether to enable Issue functionality"),
  // 是否开启 Wiki 功能
  has_wiki: z.boolean().default(true).optional().describe("Whether to enable Wiki functionality"),
  // 是否自动初始化仓库
  auto_init: z.boolean().default(false).optional().describe("Whether to automatically initialize the repository"),
  // Git Ignore 模板
  gitignore_template: z.string().optional().describe("Git Ignore template"),
  // License 模板
  license_template: z.string().optional().describe("License template"),
  // 仓库路径
  path: z.string().optional().describe("Repository path"),
});

export const ForkRepositorySchema = z.object({
  // 仓库所属空间地址 (企业、组织或个人的地址 path)
  owner: z.string().describe("Repository owner path (enterprise, organization, or personal path)"),
  // 仓库路径 (path)
  repo: z.string().describe("Repository path"),
  // 组织空间地址，不传默认为个人
  organization: z.string().optional().describe("Organization path, defaults to personal account if not provided"),
});

// Type exports
export type CreateRepositoryOptions = z.infer<typeof CreateRepositorySchema>;
export type ForkRepositoryOptions = z.infer<typeof ForkRepositorySchema>;

// Function implementations
export async function createRepository(options: CreateRepositoryOptions) {
  try {
    console.log('Creating repository parameters:', JSON.stringify(options));
    const url = "https://gitee.com/api/v5/user/repos";
    const response = await giteeRequest(url, "POST", options);
    console.log('Create repository response:', JSON.stringify(response));

    // Try to parse the response
    try {
      return GiteeRepositorySchema.parse(response);
    } catch (parseError) {
      console.error('Failed to parse repository response:', parseError);
      // Return the original response to avoid parsing errors
      return response;
    }
  } catch (error) {
    console.error('Failed to create repository request:', error);
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