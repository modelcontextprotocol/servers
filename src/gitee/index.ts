#!/usr/bin/env node
import { MCPServer } from "./common/server.js";
import { VERSION } from "./common/version.js";

// 导入操作模块
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
