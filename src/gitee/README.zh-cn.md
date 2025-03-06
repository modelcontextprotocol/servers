# Gitee MCP 服务器

Gitee 的 MCP 服务器，支持文件操作、仓库管理、问题管理、拉取请求管理等功能。

### 功能

- **可配置的 API 端点**：Gitee API 端点 URL 可以通过环境变量进行配置
- **全面的错误处理**：对常见问题提供清晰的错误信息
- **自动创建分支**：在创建/更新文件或推送更改时，如果分支不存在，则会自动创建分支
- **保留 Git 历史**：操作保持正确的 Git 历史，不会强制推送
- **批量操作**：支持单文件和多文件操作

## 工具

### 仓库操作

1. `create_repository`
   - 创建一个新的 Gitee 仓库
   - 输入：
     - `name`（字符串）：仓库名称
     - `description`（可选字符串）：仓库描述
     - `homepage`（可选字符串）：主页 URL
     - `private`（可选布尔值）：仓库是否私有
     - `has_issues`（可选布尔值）：是否启用问题功能
     - `has_wiki`（可选布尔值）：是否启用 Wiki 功能
     - `auto_init`（可选布尔值）：是否自动初始化仓库
     - `gitignore_template`（可选字符串）：Git 忽略模板
     - `license_template`（可选字符串）：许可证模板
     - `path`（可选字符串）：仓库路径
   - 返回：创建的仓库详情

2. `fork_repository`
   - 将 Gitee 仓库分叉到您的账户或指定的组织
   - 输入：
     - `owner`（字符串）：仓库所有者（用户名或组织）
     - `repo`（字符串）：仓库名称
     - `organization`（可选字符串）：要分叉到的组织（默认为个人账户）
   - 返回：分叉的仓库详情

### 分支操作

3. `create_branch`
   - 在 Gitee 仓库中创建一个新分支
   - 输入：
     - `owner`（字符串）：仓库所有者（用户名或组织）
     - `repo`（字符串）：仓库名称
     - `branch_name`（字符串）：新分支的名称
     - `refs`（字符串）：分支的源引用，默认为 master
   - 返回：创建的分支详情

4. `list_branches`
   - 列出 Gitee 仓库中的分支
   - 输入：
     - `owner`（字符串）：仓库所有者（用户名或组织）
     - `repo`（字符串）：仓库名称
     - `sort`（可选字符串）：排序字段
     - `direction`（可选字符串）：排序方向（升序或降序）
     - `page`（可选数字）：页码
     - `per_page`（可选数字）：每页项目数
   - 返回：分支列表

5. `get_branch`
   - 获取 Gitee 仓库中的特定分支信息
   - 输入：
     - `owner`（字符串）：仓库所有者（用户名或组织）
     - `repo`（字符串）：仓库名称
     - `branch`（字符串）：分支名称
   - 返回：分支详情

### 文件操作

6. `get_file_contents`
   - 获取 Gitee 仓库中文件或目录的内容
   - 输入：
     - `owner`（字符串）：仓库所有者（用户名或组织）
     - `repo`（字符串）：仓库名称
     - `path`（字符串）：文件或目录的路径
     - `branch`（可选字符串）：获取内容的分支
   - 返回：文件或目录内容

7. `create_or_update_file`
   - 在 Gitee 仓库中创建或更新单个文件
   - 输入：
     - `owner`（字符串）：仓库所有者（用户名或组织）
     - `repo`（字符串）：仓库名称
     - `path`（字符串）：创建/更新文件的路径
     - `content`（字符串）：文件内容
     - `message`（字符串）：提交信息
     - `branch`（可选字符串）：分支名称，默认为仓库的默认分支
     - `sha`（可选字符串）：文件 SHA，更新现有文件时需要
   - 返回：文件操作结果

8. `push_files`
   - 将多个文件以单个提交推送到 Gitee 仓库
   - 输入：
     - `owner`（字符串）：仓库所有者（用户名或组织）
     - `repo`（字符串）：仓库名称
     - `branch`（可选字符串）：推送到的分支
     - `message`（字符串）：提交信息
     - `files`（数组）：要推送的文件数组，每个文件包含路径和内容
   - 返回：操作结果

### 问题操作

9. `create_issue`
   - 在 Gitee 仓库中创建一个新问题
   - 输入：
     - `owner`（字符串）：仓库所有者（用户名或组织）
     - `repo`（字符串）：仓库名称
     - `title`（字符串）：问题标题
     - `body`（可选字符串）：问题内容
     - `assignees`（可选数组）：分配给问题的用户
     - `milestone`（可选数字）：里程碑 ID
     - `labels`（可选数组）：标签
     - `security_hole`（可选布尔值）：问题是否私有
   - 返回：创建的问题详情

10. `get_issue`
   - 获取 Gitee 仓库中特定问题的详情
   - 输入：
     - `owner`（字符串）：仓库所有者（用户名或组织）
     - `repo`（字符串）：仓库名称
     - `issue_number`（数字）：问题编号
   - 返回：问题详情

11. `update_issue`
   - 更新 Gitee 仓库中的现有问题
   - 输入：
     - `owner`（字符串）：仓库所有者（用户名或组织）
     - `repo`（字符串）：仓库名称
     - `issue_number`（数字）：问题编号
     - `title`（可选字符串）：问题标题
     - `body`（可选字符串）：问题内容
     - `assignees`（可选数组）：分配给问题的用户
     - `milestone`（可选数字）：里程碑 ID
     - `labels`（可选数组）：标签
     - `state`（可选字符串）：问题状态（打开、关闭、进行中）
   - 返回：更新的问题详情

12. `add_issue_comment`
   - 向现有问题添加评论
   - 输入：
     - `owner`（字符串）：仓库所有者（用户名或组织）
     - `repo`（字符串）：仓库名称
     - `issue_number`（数字）：问题编号
     - `body`（字符串）：评论内容
   - 返回：创建的评论详情

13. `list_issues`
   - 列出 Gitee 仓库中的问题，支持过滤选项
   - 输入：
     - `owner`（字符串）：仓库所有者（用户名或组织）
     - `repo`（字符串）：仓库名称
     - `state`（可选字符串）：问题状态（打开、关闭、所有）
     - `sort`（可选字符串）：排序字段（创建、更新、评论）
     - `direction`（可选字符串）：排序方向（升序、降序）
     - `labels`（可选字符串）：标签，多个标签用逗号分隔
     - `milestone`（可选数字）：里程碑 ID
     - `assignee`（可选字符串）：过滤分配给特定用户的问题
     - `creator`（可选字符串）：过滤由特定用户创建的问题
     - `program`（可选字符串）：过滤特定程序的问题
     - `page`（可选数字）：页码
     - `per_page`（可选数字）：每页项目数，最大 100
   - 返回：问题列表

### 拉取请求操作

14. `create_pull_request`
   - 在 Gitee 仓库中创建一个新拉取请求
   - 输入：
     - `owner`（字符串）：仓库所有者（用户名或组织）
     - `repo`（字符串）：仓库名称
     - `title`（字符串）：拉取请求标题
     - `head`（字符串）：源分支名称
     - `base`（字符串）：目标分支名称
     - `body`（可选字符串）：拉取请求内容
     - `milestone_number`（可选数字）：里程碑编号
     - `labels`（可选数组）：标签
     - `issue`（可选字符串）：相关问题，格式：#xxx
     - `assignees`（可选数组）：审阅者
     - `testers`（可选数组）：测试人员
     - `prune_source_branch`（可选布尔值）：合并后是否删除源分支
   - 返回：创建的拉取请求详情

### 用户操作

15. `get_user`
   - 获取 Gitee 用户的详情
   - 输入：
     - `username`（字符串）：用户名
   - 返回：用户详情

## 安装

1. 克隆仓库
2. 安装依赖
3. 构建项目

```bash
cd src/gitee

# 安装依赖
npm install

# 构建项目
npm run build
```

## 配置

在根目录下创建一个 `.env` 文件，内容如下：

```
GITEE_PERSONAL_ACCESS_TOKEN=put_your_gitee_personal_access_token_here
```

您可以在 Gitee 账户设置中获取个人访问令牌。

## 用法

### 运行服务器

```bash
# 启动服务器
npm start
```

服务器运行在 stdio 上，这使得它可以作为 MCP 客户端的子进程使用。

### Docker

您也可以使用 Docker 运行服务器：

```bash
# 构建 Docker 镜像
docker build -t gitee-mcp-server -f Dockerfile .

# 运行容器
docker run -e GITEE_PERSONAL_ACCESS_TOKEN=your_token gitee-mcp-server
```

## 依赖

- `@modelcontextprotocol/sdk`：MCP SDK 用于服务器实现
- `universal-user-agent`：用于生成用户代理字符串
- `zod`：用于模式验证
- `zod-to-json-schema`：用于将 Zod 模式转换为 JSON 模式

## 调试工具

服务器包括一个调试工具函数，可以用于记录调试信息：

```typescript
import { debug } from './common/utils.js';

debug('要记录的消息');
debug('带有数据的消息：', { key: 'value' });
```

## 许可

本 MCP 服务器以 MIT 许可证授权。这意味着您可以自由使用、修改和分发软件，必须遵守 MIT 许可证的条款和条件。有关更多详细信息，请参阅项目仓库中的 LICENSE 文件。

## 作者

- 诺墨 <normal@normalcoder.com>
- Gitee (https://gitee.com)

## 链接

- [Model Context Protocol](https://modelcontextprotocol.io)
