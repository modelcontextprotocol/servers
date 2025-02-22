#!/usr/bin/env node
import { MCPServer } from "./common/server.js";
import { VERSION } from "./common/version.js";

// 导入操作模块
import * as branchOperations from "./operations/branches.js";
import * as fileOperations from "./operations/files.js";
import * as issueOperations from "./operations/issues.js";
import * as repoOperations from "./operations/repos.js";
import * as userOperations from "./operations/users.js";
import { z } from 'zod';

// 创建 Gitee MCP 服务器
export function createGiteeMCPServer() {
  const server = new MCPServer({
    name: "gitee",
    version: VERSION,
  });

  // 注册仓库操作工具
  server.registerTool({
    name: "create_repository",
    description: "创建 Gitee 仓库",
    schema: repoOperations.CreateRepositorySchema,
    handler: async (params: any) => {
      try {
        // 确保 private 参数是布尔值
        if (params.private !== undefined) {
          if (typeof params.private === 'string') {
            // 将字符串转换为布尔值
            params.private = params.private.toLowerCase() === 'true';
          }
        }

        // 处理其他可能的布尔值字段
        ['has_issues', 'has_wiki', 'auto_init'].forEach(field => {
          if (params[field] !== undefined && typeof params[field] === 'string') {
            params[field] = params[field].toLowerCase() === 'true';
          }
        });

        return await repoOperations.createRepository(params);
      } catch (error) {
        console.error('创建仓库失败:', error);
        throw error;
      }
    },
  });

  server.registerTool({
    name: "fork_repository",
    description: "Fork Gitee 仓库",
    schema: repoOperations.ForkRepositorySchema,
    handler: async (params: any) => {
      const { owner, repo, organization } = params;
      return await repoOperations.forkRepository(owner, repo, organization);
    },
  });

  server.registerTool({
    name: "search_repositories",
    description: "搜索 Gitee 仓库",
    schema: repoOperations.SearchRepositoriesSchema,
    handler: async (params: any) => {
      const { query, page, perPage } = params;
      return await repoOperations.searchRepositories(query, page, perPage);
    },
  });

  // 注册分支操作工具
  server.registerTool({
    name: "create_branch",
    description: "在 Gitee 仓库中创建一个新分支",
    schema: branchOperations.CreateBranchSchema,
    handler: async (params: any) => {
      const { owner, repo, branch_name, refs } = params;
      return await branchOperations.createBranchFromRef(owner, repo, branch_name, refs);
    },
  });

  server.registerTool({
    name: "list_branches",
    description: "列出 Gitee 仓库中的分支",
    schema: branchOperations.ListBranchesSchema,
    handler: async (params: any) => {
      const { owner, repo, sort, direction, page, per_page } = params;
      return await branchOperations.listBranches(
        owner,
        repo,
        sort,
        direction,
        page,
        per_page
      );
    },
  });

  server.registerTool({
    name: "get_branch",
    description: "获取 Gitee 仓库中的特定分支信息",
    schema: branchOperations.GetBranchSchema,
    handler: async (params: any) => {
      const { owner, repo, branch } = params;
      return await branchOperations.getBranch(owner, repo, branch);
    },
  });

  // 注册文件操作工具
  server.registerTool({
    name: "get_file_contents",
    description: "获取 Gitee 仓库中文件或目录的内容",
    schema: fileOperations.GetFileContentsSchema,
    handler: async (params: any) => {
      const { owner, repo, path, branch } = params;
      return await fileOperations.getFileContents(owner, repo, path, branch);
    },
  });

  server.registerTool({
    name: "create_or_update_file",
    description: "在 Gitee 仓库中创建或更新文件",
    schema: fileOperations.CreateOrUpdateFileSchema,
    handler: async (params: any) => {
      const { owner, repo, path, content, message, branch, sha } = params;
      return await fileOperations.createOrUpdateFile(
        owner,
        repo,
        path,
        content,
        message,
        branch,
        sha
      );
    },
  });

  server.registerTool({
    name: "push_files",
    description: "向 Gitee 仓库提交多个文件",
    schema: fileOperations.PushFilesSchema,
    handler: async (params: any) => {
      const { owner, repo, branch, message, files } = params;
      return await fileOperations.pushFiles(owner, repo, branch, files, message);
    },
  });

  // 注册 Issue 操作工具
  server.registerTool({
    name: "create_issue",
    description: "在 Gitee 仓库中创建 Issue",
    schema: issueOperations.CreateIssueSchema,
    handler: async (params: any) => {
      const { owner, repo, ...options } = params;
      return await issueOperations.createIssue(owner, repo, options);
    },
  });

  server.registerTool({
    name: "list_issues",
    description: "列出 Gitee 仓库中的 Issues",
    schema: issueOperations.ListIssuesOptionsSchema,
    handler: async (params: any) => {
      const { owner, repo, ...options } = params;
      return await issueOperations.listIssues(owner, repo, options);
    },
  });

  server.registerTool({
    name: "get_issue",
    description: "获取 Gitee 仓库中的特定 Issue",
    schema: issueOperations.GetIssueSchema,
    handler: async (params: any) => {
      const { owner, repo, issue_number } = params;
      return await issueOperations.getIssue(owner, repo, issue_number);
    },
  });

  server.registerTool({
    name: "update_issue",
    description: "更新 Gitee 仓库中的 Issue",
    schema: issueOperations.UpdateIssueOptionsSchema,
    handler: async (params: any) => {
      const { owner, repo, issue_number, ...options } = params;
      return await issueOperations.updateIssue(owner, repo, issue_number, options);
    },
  });

  server.registerTool({
    name: "add_issue_comment",
    description: "向 Gitee 仓库中的 Issue 添加评论",
    schema: issueOperations.IssueCommentSchema,
    handler: async (params: any) => {
      const { owner, repo, issue_number, body } = params;
      return await issueOperations.addIssueComment(owner, repo, issue_number, body);
    },
  });

  // 注册用户操作工具
  server.registerTool({
    name: "get_user",
    description: "获取 Gitee 用户信息",
    schema: userOperations.GetUserSchema,
    handler: async (params: any) => {
      const { username } = params;
      return await userOperations.getUser(username);
    },
  });

  server.registerTool({
    name: "get_current_user",
    description: "获取当前认证的 Gitee 用户信息",
    schema: z.object({}),
    handler: async () => {
      return await userOperations.getCurrentUser();
    },
  });

  return server;
}

export default createGiteeMCPServer;
