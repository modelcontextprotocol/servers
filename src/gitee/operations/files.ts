import { z } from "zod";
import { giteeRequest, validateOwnerName, validateRepositoryName } from "../common/utils.js";
import { GiteeDirectoryContentSchema, GiteeFileContentSchema, GiteeFileOperationResultSchema } from "../common/types.js";

// Schema definitions
export const GetFileContentsSchema = z.object({
  // 仓库所属空间地址 (企业、组织或个人的地址 path)
  owner: z.string().describe("Repository owner path (enterprise, organization, or personal path)"),
  // 仓库路径 (path)
  repo: z.string().describe("Repository path"),
  // 文件路径
  path: z.string().describe("File path"),
  // 分支名称，默认为仓库的默认分支
  branch: z.string().optional().describe("Branch name, defaults to the repository's default branch"),
});

export const CreateOrUpdateFileSchema = z.object({
  // 仓库所属空间地址 (企业、组织或个人的地址 path)
  owner: z.string().describe("Repository owner path (enterprise, organization, or personal path)"),
  // 仓库路径 (path)
  repo: z.string().describe("Repository path"),
  // 文件路径
  path: z.string().describe("File path"),
  // 文件内容
  content: z.string().describe("File content"),
  // 提交信息
  message: z.string().describe("Commit message"),
  // 分支名称，默认为仓库的默认分支
  branch: z.string().optional().describe("Branch name, defaults to the repository's default branch"),
  // 文件的 SHA，更新文件时必须提供
  sha: z.string().optional().describe("File SHA, required when updating an existing file"),
});

export const PushFilesSchema = z.object({
  // 仓库所属空间地址 (企业、组织或个人的地址 path)
  owner: z.string().describe("Repository owner path (enterprise, organization, or personal path)"),
  // 仓库路径 (path)
  repo: z.string().describe("Repository path"),
  // 分支名称，默认为仓库的默认分支
  branch: z.string().optional().describe("Branch name, defaults to the repository's default branch"),
  // 提交信息
  message: z.string().describe("Commit message"),
  // 要提交的文件列表
  files: z.array(z.object({
    // 文件路径
    path: z.string().describe("File path"),
    // 文件内容
    content: z.string().describe("File content"),
  })).describe("List of files to commit"),
});

// Type exports
export type GetFileContentsOptions = z.infer<typeof GetFileContentsSchema>;
export type CreateOrUpdateFileOptions = z.infer<typeof CreateOrUpdateFileSchema>;
export type PushFilesOptions = z.infer<typeof PushFilesSchema>;

// Function implementations
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

  // Determine whether it is a file or directory based on the return type.
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

  // Base64 encode the content
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
  // Since the Gitee API does not support submitting multiple files in a single commit, we need to submit them one by one.
  // This simplification assumes that Git Tree API is used to implement batch submission.
  const results = [];

  for (const file of files) {
    try {
      // Try to get the file contents, to determine whether it is created or updated
      let sha: string | undefined;
      try {
        const existingFile = await getFileContents(owner, repo, file.path, branch);
        if (!Array.isArray(existingFile)) {
          sha = existingFile.sha;
        }
      } catch (error) {
        // The file does not exist, creating a new file.
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
