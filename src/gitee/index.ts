#!/usr/bin/env node
import { MCPServer } from "./common/server.js";
import { VERSION } from "./common/version.js";

// 导入操作模块
import * as userOperations from "./operations/users.js";
import { z } from 'zod';

// 创建 Gitee MCP 服务器
export function createGiteeMCPServer() {
  const server = new MCPServer({
    name: "gitee",
    version: VERSION,
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
