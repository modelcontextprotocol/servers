# 模型上下文协议服务器 (Model Context Protocol Servers)

<p align="center">
  <a href="README.md">English</a> · <b>简体中文</b>
</p>

本仓库是 [Model Context Protocol](https://modelcontextprotocol.io/) (MCP，模型上下文协议) 的**官方参考实现合集**，同时包含社区构建的服务器索引与相关生态资源。

> [!IMPORTANT]
> 如果您正在寻找完整的 MCP 服务器列表，可以在 [MCP Registry 官方注册中心](https://registry.modelcontextprotocol.io/) 中浏览已发布的服务器。本 README 所在的仓库专门用于托管由 MCP 指导小组维护的少量官方参考服务器。

> [!WARNING]
> 本仓库中的服务器定位为 **参考实现 (Reference Implementations)**，旨在演示 MCP 协议核心特性与官方 SDK 的使用方法。它们作为开发者构建自有 MCP 服务器的教学示例，并非直接用于生产环境的开箱即用方案。开发者应评估自身安全需求，并根据具体威胁模型和业务场景实施适当的安全防护措施。

本仓库中的参考服务器展示了 MCP 的通用性与可扩展性，演示了如何通过安全、可控的方式为大语言模型（LLM）赋予调用外部工具和访问私有数据源的能力。
通常，每个 MCP 服务器均基于官方 MCP SDK 进行构建：

- [C# MCP SDK](https://github.com/modelcontextprotocol/csharp-sdk)
- [Go MCP SDK](https://github.com/modelcontextprotocol/go-sdk)
- [Java MCP SDK](https://github.com/modelcontextprotocol/java-sdk)
- [Kotlin MCP SDK](https://github.com/modelcontextprotocol/kotlin-sdk)
- [PHP MCP SDK](https://github.com/modelcontextprotocol/php-sdk)
- [Python MCP SDK](https://github.com/modelcontextprotocol/python-sdk)
- [Ruby MCP SDK](https://github.com/modelcontextprotocol/ruby-sdk)
- [Rust MCP SDK](https://github.com/modelcontextprotocol/rust-sdk)
- [Swift MCP SDK](https://github.com/modelcontextprotocol/swift-sdk)
- [TypeScript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## 🌟 官方参考服务器 (Reference Servers)

这些服务器旨在展示 MCP 核心协议规范及官方 SDK 的标准用法：

- **[Everything](src/everything)** - 包含 Prompts（提示词）、Resources（资源）和 Tools（工具）全量特性的全功能测试/参考服务器。
- **[Fetch](src/fetch)** - 网页内容抓取与 HTML 转 Markdown 转换，便于 LLM 高效阅读与总结。
- **[Filesystem](src/filesystem)** - 支持可配置访问控制目录的安全本地文件系统读写操作。
- **[Git](src/git)** - 读取、搜索和操作 Git 代码仓库的专业工具。
- **[Memory](src/memory)** - 基于知识图谱（Knowledge Graph）的持久化实体与关系记忆系统。
- **[Sequential Thinking](src/sequentialthinking)** - 通过动态反思性思维链步骤进行深度复杂问题求解。
- **[Time](src/time)** - 获取当前时间与进行跨时区时间转换。

### 📦 已归档的参考实现 (Archived)

以下早期参考服务器现已归档至 [servers-archived](https://github.com/modelcontextprotocol/servers-archived) 仓库，部分已由官方或社区团队独立维护：

- **[AWS KB Retrieval](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/aws-kb-retrieval-server)** - 使用 Bedrock Agent Runtime 从 AWS 知识库检索。
- **[Brave Search](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/brave-search)** - 使用 Brave 搜索 API 进行网络和本地搜索，现已由 [Brave 官方服务器](https://github.com/brave/brave-search-mcp-server) 替代。
- **[EverArt](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/everart)** - 使用多种图像生成模型进行 AI 作图。
- **[GitHub](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/github)** - 仓库管理、文件操作与 GitHub API 深度集成。
- **[GitLab](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/gitlab)** - GitLab API 集成，支持项目与 Issue 管理。
- **[Google Drive](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/gdrive)** - Google 云端硬盘文件访问与搜索。
- **[Google Maps](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/google-maps)** - 地理位置服务、路线规划与地点详情查询。
- **[PostgreSQL](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/postgres)** - 只读数据库访问与 Schema 结构检查。
- **[Puppeteer](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/puppeteer)** - 浏览器自动化操作与网页数据抓取。
- **[Redis](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/redis)** - 与 Redis 键值数据库进行交互操作。
- **[Sentry](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/sentry)** - 从 Sentry.io 检索与分析错误 Issue。
- **[Slack](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/slack)** - 频道管理与消息发送，现由 [Zencoder](https://github.com/zencoderai/slack-mcp-server) 独立维护。
- **[SQLite](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/sqlite)** - SQLite 数据库交互与商业分析查询。

## 🚀 快速上手 (Getting Started)

### 运行本仓库中的 MCP 服务器

基于 **TypeScript** 的服务器可以通过 `npx` 直接免安装运行。

例如启动 [Memory 记忆图谱](src/memory) 服务器：
```sh
npx -y @modelcontextprotocol/server-memory
```

基于 **Python** 的服务器可以通过 [`uvx`](https://docs.astral.sh/uv/concepts/tools/)（推荐）或 [`pip`](https://pypi.org/project/pip/) 直接运行：

例如启动 [Git 仓库管理](src/git) 服务器：
```sh
# 使用 uvx 快速运行（推荐）
uvx mcp-server-git

# 或使用 pip 安装运行
pip install mcp-server-git
python -m mcp_server_git
```

请参考 [uv 官方安装指南](https://docs.astral.sh/uv/getting-started/installation/) 或 [pip 安装指南](https://pip.pypa.io/en/stable/installation/) 进行环境配置。

### 在 MCP 客户端中配置使用

单独运行服务器仅用于调试，实际使用时需要将其配置到支持 MCP 协议的客户端中。例如在 **Claude Desktop** 中的配置文件配置如下：

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```

在 **Windows 系统** 上，需要使用 `cmd /c` 包装 `npx`：

```json
{
  "mcpServers": {
    "memory": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```

在 Claude Desktop 中配置多个 MCP 服务器的综合示例：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/files"]
    },
    "git": {
      "command": "uvx",
      "args": ["mcp-server-git", "--repository", "path/to/git/repo"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
    }
  }
}
```

在 Windows 上，请将上述每个基于 `npx` 的条目中的 `"command"` 改为 `"cmd"`，并在 `"args"` 最前面添加 `"/c", "npx"`；基于 `uvx` 的条目保持不变即可。

## 🛠️ 创建您自己的 MCP 服务器

想构建属于自己的 MCP 服务器？欢迎访问官方文档 [modelcontextprotocol.io](https://modelcontextprotocol.io/introduction)，获取关于实现 MCP 服务器的全面指南、最佳实践与技术细节规范。

## 📚 延伸阅读

查阅 [ADDITIONAL.md](ADDITIONAL.md) 获取简化 MCP 服务器与客户端开发的精选框架和工具资源列表。

## 🤝 参与贡献

请参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 了解如何为本仓库贡献代码与参考实现。

## 📦 发布规范

请参阅 [RELEASING.md](RELEASING.md) 了解自动化 CI 发布机制（基于 OIDC 可信发布机制，无需注册表 Token）以及如何重试失败的发布。

## 🔒 安全性

请参阅 [SECURITY.md](SECURITY.md) 了解如何安全地向团队报告潜在的安全漏洞。

## 📜 开源协议

新贡献的代码遵循 Apache License 2.0 协议，现有历史代码遵循 MIT 协议 - 详情请参阅 [LICENSE](LICENSE) 文件。

## 💬 社区交流

- [GitHub Discussions 社区讨论区](https://github.com/orgs/modelcontextprotocol/discussions)

## ⭐ 支持本项目

如果您觉得 MCP 系列服务器对您有所帮助，欢迎为本仓库点亮 Star，并积极贡献新的参考服务器或优化改进！

---

由 **Anthropic** 组织维护，与全球开源社区携手共建。Model Context Protocol 是一项完全开放的开源协议，我们热烈欢迎所有人贡献自己的服务器与生态工具！

---

> 💡 **文档维护说明**：本中文文档由社区志愿者（@JasonYeYuhe）翻译维护，最后同步更新于 2026年8月31日。如发现内容与官方英文原版存在差异或新特性滞后，欢迎提交 PR 共同完善！
