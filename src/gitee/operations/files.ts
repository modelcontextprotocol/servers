import { z } from "zod";
import { giteeRequest, validateOwnerName, validateRepositoryName } from "../common/utils.js";
import { GiteeDirectoryContentSchema, GiteeFileContentSchema, GiteeFileOperationResultSchema } from "../common/types.js";

// Schema 定义
export const GetFileContentsSchema = z.object({
  owner: z.string().describe("仓库所属空间地址 (企业、组织或个人的地址 path)"),
  repo: z.string().describe("仓库路径 (path)"),
  path: z.string().describe("文件路径"),
  branch: z.string().optional().describe("分支名称，默认为仓库的默认分支"),
});

export const CreateOrUpdateFileSchema = z.object({
  owner: z.string().describe("仓库所属空间地址 (企业、组织或个人的地址 path)"),
  repo: z.string().describe("仓库路径 (path)"),
  path: z.string().describe("文件路径"),
  content: z.string().describe("文件内容"),
  message: z.string().describe("提交信息"),
  branch: z.string().optional().describe("分支名称，默认为仓库的默认分支"),
  sha: z.string().optional().describe("文件的 SHA，更新文件时必须提供"),
});

export const PushFilesSchema = z.object({
  owner: z.string().describe("仓库所属空间地址 (企业、组织或个人的地址 path)"),
  repo: z.string().describe("仓库路径 (path)"),
  branch: z.string().optional().describe("分支名称，默认为仓库的默认分支"),
  message: z.string().describe("提交信息"),
  files: z.array(z.object({
    path: z.string().describe("文件路径"),
    content: z.string().describe("文件内容"),
  })).describe("要提交的文件列表"),
});

// 类型导出
export type GetFileContentsOptions = z.infer<typeof GetFileContentsSchema>;
export type CreateOrUpdateFileOptions = z.infer<typeof CreateOrUpdateFileSchema>;
export type PushFilesOptions = z.infer<typeof PushFilesSchema>;

// 函数实现
export async function getFileContents(
  owner: string,
  repo: string,
  path: string,
  branch?: string
) {
  owner = validateOwnerName(owner);
  repo = validateRepositoryName(repo);

  const url = new URL(`https://gitee.com/api/v5/repos/${owner}/${repo}/contents/${path}`);
  if (branch) {
    url.searchParams.append("ref", branch);
  }

  const response = await giteeRequest(url.toString(), "GET");

  // 根据返回类型判断是文件还是目录
  if (Array.isArray(response)) {
    return GiteeDirectoryContentSchema.parse(response);
  } else {
    return GiteeFileContentSchema.parse(response);
  }
}

export async function createOrUpdateFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch?: string,
  sha?: string
) {
  owner = validateOwnerName(owner);
  repo = validateRepositoryName(repo);

  // Base64 编码内容
  const contentBase64 = Buffer.from(content).toString("base64");

  const url = `https://gitee.com/api/v5/repos/${owner}/${repo}/contents/${path}`;
  const body: Record<string, string> = {
    content: contentBase64,
    message,
  };

  if (branch) {
    body.branch = branch;
  }

  if (sha) {
    body.sha = sha;
  }

  const method = sha ? "PUT" : "POST";
  const response = await giteeRequest(url, method, body);

  return GiteeFileOperationResultSchema.parse(response);
}

export async function pushFiles(
  owner: string,
  repo: string,
  branch: string | undefined,
  files: { path: string; content: string }[],
  message: string
) {
  // 由于 Gitee API 不支持一次提交多个文件，我们需要逐个提交
  // 这里简化处理，实际上应该使用 Git Tree API 来实现批量提交
  const results = [];

  for (const file of files) {
    try {
      // 先尝试获取文件，判断是创建还是更新
      let sha: string | undefined;
      try {
        const existingFile = await getFileContents(owner, repo, file.path, branch);
        if (!Array.isArray(existingFile)) {
          sha = existingFile.sha;
        }
      } catch (error) {
        // 文件不存在，创建新文件
      }

      const result = await createOrUpdateFile(
        owner,
        repo,
        file.path,
        file.content,
        message,
        branch,
        sha
      );

      results.push({
        path: file.path,
        success: true,
        result,
      });
    } catch (error) {
      results.push({
        path: file.path,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    message: `已处理 ${results.length} 个文件`,
    results,
  };
}
