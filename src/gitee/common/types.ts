import { z } from "zod";

// Definition of Basic Types
export const GiteeUserSchema = z.object({
  id: z.number().describe("The digital ID generated for a user after creation on Gitee, which remains constant and is not the username."), // 用户在 Gitee 创建后产生的数字 ID，恒定不变，不是用户名
  login: z.string().describe("User login name"), // 用户登录名
  name: z.string().nullable().describe("User name"), // 用户名称
  avatar_url: z.string().url().nullable().describe("User avatar URL"), // 用户头像 URL
  url: z.string().url().describe("User API URL"), // 用户 API URL
  html_url: z.string().url().describe("User homepage URL"), // 用户主页 URL
  remark: z.string().nullable().describe("User remark"), // 用户备注
  followers_url: z.string().url().describe("User followers URL"), // 用户关注者 URL
  following_url: z.string().url().describe("User following URL"), // 用户正在关注 URL
  gists_url: z.string().url().describe("User gists URL"), // 用户 Gists URL
  starred_url: z.string().url().describe("User starred URL"), // 用户星标 URL
  subscriptions_url: z.string().url().describe("User subscriptions URL"), // 用户订阅 URL
  organizations_url: z.string().url().describe("User organizations URL"), // 用户组织 URL
  repos_url: z.string().url().describe("User repositories URL"), // 用户仓库 URL
  events_url: z.string().url().describe("User events URL"), // 用户事件 URL
  received_events_url: z.string().url().describe("User received events URL"), // 用户接收的事件 URL
  type: z.string().describe("User type"), // 用户类型
  site_admin: z.boolean().optional().default(false).describe("Whether the user is a site admin"), // 是否是网站管理员
  blog: z.string().nullable().optional().describe("User blog"), // 用户博客
  weibo: z.string().nullable().optional().describe("User Weibo"), // 用户微博
  bio: z.string().nullable().optional().describe("User bio"), // 用户简介
  public_repos: z.number().optional().describe("Number of public repositories"), // 公开仓库数量
  public_gists: z.number().optional().describe("Number of public gists"), // 公开 Gists 数量
  followers: z.number().optional().describe("Number of followers"), // 关注者数量
  following: z.number().optional().describe("Number of following"), // 正在关注数量
  stared: z.number().optional().describe("Number of stars"), // 星标数量
  watched: z.number().optional().describe("Number of watched repositories"), // 关注数量
  created_at: z.string().optional().describe("Creation time"), // 创建时间
  updated_at: z.string().optional().describe("Update time"), // 更新时间
  email: z.string().email().nullable().optional().describe("User email"), // 用户邮箱
});

// Declare a type and then define it to avoid circular references.
export type GiteeRepositorySchemaType = z.ZodObject<any>;
export let GiteeRepositorySchema: GiteeRepositorySchemaType;

GiteeRepositorySchema = z.object({
  id: z.number().describe("Repository ID"), // 仓库 ID
  full_name: z.string().describe("Repository full name"), // 仓库完整名称
  human_name: z.string().describe("Repository human-readable name"), // 仓库人性化名称
  url: z.string().url().describe("Repository API URL"), // 仓库 API URL
  namespace: z.object({
    id: z.number().describe("Namespace ID"), // 命名空间 ID
    name: z.string().describe("Namespace name"), // 命名空间名称
    path: z.string().describe("Namespace path"), // 命名空间路径
    type: z.string().describe("Namespace type"), // 命名空间类型
  }).describe("Repository namespace information"), // 命名空间信息
  path: z.string().describe("Repository path"), // 仓库路径
  name: z.string().describe("Repository name"), // 仓库名称
  owner: GiteeUserSchema.describe("Repository owner"), // 仓库所有者
  assigner: GiteeUserSchema.nullable().describe("Repository assigner"), // 仓库指派者
  description: z.string().nullable().describe("Repository description"), // 仓库描述
  private: z.boolean().describe("Whether the repository is private"), // 是否私有
  public: z.boolean().describe("Whether the repository is public"), // 是否公开
  internal: z.boolean().describe("Whether the repository is internal"), // 是否内部的
  fork: z.boolean().describe("Whether the repository is forked"), // 是否是复刻的
  html_url: z.string().url().describe("Repository homepage URL"), // 仓库主页 URL
  ssh_url: z.string().describe("Repository SSH URL"), // 仓库 SSH URL
  forks_url: z.string().url().optional().describe("Repository forks URL"), // 仓库复刻 URL
  keys_url: z.string().url().optional().describe("Repository keys URL"), // 仓库密钥 URL
  collaborators_url: z.string().url().optional().describe("Repository collaborators URL"), // 仓库协作者 URL
  hooks_url: z.string().url().optional().describe("Repository hooks URL"), // 仓库钩子 URL
  branches_url: z.string().url().optional().describe("Repository branches URL"), // 仓库分支 URL
  tags_url: z.string().url().optional().describe("Repository tags URL"), // 仓库标签 URL
  blobs_url: z.string().url().optional().describe("Repository blobs URL"), // 仓库 Blob URL
  stargazers_url: z.string().url().optional().describe("Repository stargazers URL"), // 仓库星标 URL
  contributors_url: z.string().url().optional().describe("Repository contributors URL"), // 仓库贡献者 URL
  commits_url: z.string().url().optional().describe("Repository commits URL"), // 仓库提交 URL
  comments_url: z.string().url().optional().describe("Repository comments URL"), // 仓库评论 URL
  issue_comment_url: z.string().url().optional().describe("Repository issue comment URL"), // 仓库 Issue 评论 URL
  issues_url: z.string().url().optional().describe("Repository issues URL"), // 仓库 Issues URL
  pulls_url: z.string().url().optional().describe("Repository pull requests URL"), // 仓库 Pull Requests URL
  milestones_url: z.string().url().optional().describe("Repository milestones URL"), // 仓库里程碑 URL
  notifications_url: z.string().url().optional().describe("Repository notifications URL"), // 仓库通知 URL
  labels_url: z.string().url().optional().describe("Repository labels URL"), // 仓库标签 URL
  releases_url: z.string().url().optional().describe("Repository releases URL"), // 仓库发行版 URL
  recommend: z.boolean().optional().describe("Whether the repository is recommended"), // 是否推荐
  gvp: z.boolean().optional().describe("Whether the repository is a GVP project"), // 是否 GVP 项目
  homepage: z.string().nullable().optional().describe("Repository homepage"), // 仓库主页
  language: z.string().nullable().optional().describe("Repository language"), // 仓库使用的语言
  forks_count: z.number().optional().describe("Number of forks"), // 复刻数量
  stargazers_count: z.number().optional().describe("Number of stars"), // 星标数量
  watchers_count: z.number().optional().describe("Number of watchers"), // 关注数量
  default_branch: z.string().nullable().optional().describe("Default branch"), // 默认分支
  open_issues_count: z.number().optional().describe("Number of open issues"), // 开放的 Issue 数量
  has_issues: z.boolean().optional().describe("Whether issues are enabled"), // 是否启用 Issue 功能
  has_wiki: z.boolean().optional().describe("Whether wiki is enabled"), // 是否启用 Wiki 功能
  issue_comment: z.boolean().nullable().optional().describe("Whether issue comments are enabled"), // 是否启用 Issue 评论
  can_comment: z.boolean().optional().describe("Whether comments are allowed"), // 是否可以评论
  pull_requests_enabled: z.boolean().optional().describe("Whether pull requests are enabled"), // 是否启用 Pull Requests
  has_page: z.boolean().optional().describe("Whether pages are enabled"), // 是否有页面
  license: z.string().nullable().optional().describe("License"), // 许可证
  outsourced: z.boolean().optional().describe("Whether the repository is outsourced"), // 是否外包
  project_creator: z.string().optional().describe("Project creator"), // 项目创建者
  members: z.array(z.string()).optional().describe("Members"), // 成员
  pushed_at: z.string().nullable().optional().describe("Push time"), // 推送时间
  created_at: z.string().optional().describe("Creation time"), // 创建时间
  updated_at: z.string().optional().describe("Update time"), // 更新时间
  parent: z.lazy(() => GiteeRepositorySchema).nullable().optional().describe("Parent repository"), // 父仓库
  paas: z.string().nullable().optional().describe("PaaS platform"), // PaaS 平台
  assignees_number: z.number().optional().describe("Number of assignees"), // 指派者数量
  testers_number: z.number().optional().describe("Number of testers"), // 测试者数量
  assignee: z.union([GiteeUserSchema, z.array(z.any()), z.null()]).optional().describe("Assignee"), // 指派者
  enterprise: z.object({
    id: z.number().describe("Enterprise ID"), // 企业 ID
    name: z.string().describe("Enterprise name"), // 企业名称
    url: z.string().url().describe("Enterprise URL"), // 企业 URL
  }).nullable().optional().describe("Enterprise information"), // 企业信息
  // 权限信息
  permission: z.object({
    pull: z.boolean().describe("Whether pull permission is granted"), // 是否有拉取权限
    push: z.boolean().describe("Whether push permission is granted"), // 是否有推送权限
    admin: z.boolean().describe("Whether admin permission is granted"), // 是否有管理权限
  }).optional().describe("Permission information"), // 权限信息
});

export const GiteeBranchSchema = z.object({
  name: z.string().describe("Branch name"), // 分支名称
  commit: z.object({
    sha: z.string().describe("Commit SHA"), // 提交 SHA
    url: z.string().url().describe("Commit URL"), // 提交 URL
  }).describe("Commit information"), // 提交信息
  protected: z.boolean().describe("Whether the branch is protected"), // 是否受保护
  protection_url: z.string().url().optional().describe("Protection URL"), // 保护 URL
});

export const GiteeCompleteBranchSchema = GiteeBranchSchema.extend({
  _links: z.object({
    self: z.string().url().describe("Self URL"), // 自身 URL
    html: z.string().url().describe("HTML URL"), // HTML URL
  }).describe("Links information"), // 链接信息
});

export const GiteeCommitSchema = z.object({
  url: z.string().url().describe("Commit API URL"), // 提交 API URL
  sha: z.string().describe("Commit SHA"), // 提交 SHA
  html_url: z.string().url().describe("Commit HTML URL"), // 提交 HTML URL
  comments_url: z.string().url().describe("Commit comments URL"), // 提交评论 URL
  commit: z.object({
    url: z.string().url().describe("Commit URL"), // 提交 URL
    author: z.object({
      name: z.string().describe("Author name"), // 作者名称
      email: z.string().email().describe("Author email"), // 作者邮箱
      date: z.string().describe("Author date"), // 作者日期
    }).describe("Author information"), // 作者信息
    committer: z.object({
      name: z.string().describe("Committer name"), // 提交者名称
      email: z.string().email().describe("Committer email"), // 提交者邮箱
      date: z.string().describe("Commit date"), // 提交日期
    }).describe("Committer information"), // 提交者信息
    message: z.string().describe("Commit message"), // 提交信息
    tree: z.object({
      url: z.string().url().describe("Tree URL"), // 树 URL
      sha: z.string().describe("Tree SHA"), // 树 SHA
    }).describe("Tree information"), // 树信息
  }).describe("Commit details"), // 提交详细信息
  author: GiteeUserSchema.nullable().describe("Author user information"), // 作者用户信息
  committer: GiteeUserSchema.nullable().describe("Committer user information"), // 提交者用户信息
  parents: z.array(z.object({
    url: z.string().url().describe("Parent commit URL"), // 父提交 URL
    sha: z.string().describe("Parent commit SHA"), // 父提交 SHA
  })).describe("Parent commits"), // 父提交
});

export const GiteeFileContentSchema = z.object({
  // 文件类型
  type: z.string().describe("File type"), // 文件类型
  encoding: z.string().optional().describe("Encoding method"), // 编码方式
  size: z.number().describe("File size"), // 文件大小
  name: z.string().describe("File name"), // 文件名
  path: z.string().describe("File path"), // 文件路径
  content: z.string().optional().describe("File content"), // 文件内容
  sha: z.string().describe("File SHA"), // 文件 SHA
  url: z.string().url().describe("File API URL"), // 文件 API URL
  html_url: z.string().url().nullable().describe("File HTML URL"), // 文件 HTML URL
  download_url: z.string().url().nullable().describe("File download URL"), // 文件下载 URL
  _links: z.object({
    self: z.string().url().describe("Self URL"), // 自身 URL
    html: z.string().url().nullable().describe("HTML URL"), // HTML URL
  }).describe("Links information"), // 链接信息
});

export const GiteeDirectoryContentSchema = z.array(z.object({
  type: z.string().describe("Directory item type"), // 目录项类型
  size: z.number().describe("Directory item size"), // 目录项大小
  name: z.string().describe("Directory item name"), // 目录项名称
  path: z.string().describe("Directory item path"), // 目录项路径
  sha: z.string().describe("Directory item SHA"), // 目录项 SHA
  url: z.string().url().describe("Directory item API URL"), // 目录项 API URL
  html_url: z.string().url().nullable().describe("Directory item HTML URL"), // 目录项 HTML URL
  download_url: z.string().url().nullable().describe("Directory item download URL"), // 目录项下载 URL
  _links: z.object({
    self: z.string().url().describe("Self URL"), // 自身 URL
    html: z.string().url().nullable().describe("HTML URL"), // HTML URL
  }).describe("Links information"),
}));

export const GiteeFileOperationResultSchema = z.object({
  content: GiteeFileContentSchema.nullable().describe("File content"), // 文件内容
  commit: z.object({
    sha: z.string().describe("Commit SHA"), // 提交 SHA
    author: z.object({
      name: z.string().describe("Author name"), // 作者名称
      email: z.string().email().describe("Author email"), // 作者邮箱
      date: z.string().describe("Commit date"), // 提交日期
    }).describe("Author information"), // 作者信息
    committer: z.object({
      name: z.string().describe("Committer name"), // 提交者名称
      email: z.string().email().describe("Committer email"), // 提交者邮箱
      date: z.string().describe("Commit date"), // 提交日期
    }).describe("Committer information"), // 提交者信息
    message: z.string().describe("Commit message"), // 提交信息
    tree: z.object({
      sha: z.string().describe("Tree SHA"), // 树 SHA
      url: z.string().url().describe("Tree URL"), // 树 URL
    }).describe("Tree information"), // 树信息
    parents: z.array(z.object({
      sha: z.string().describe("Parent commit SHA"), // 父提交 SHA
      url: z.string().url().describe("Parent commit URL"), // 父提交 URL
      html_url: z.string().url().optional().describe("Parent commit HTML URL"), // 父提交 HTML URL
    })).describe("Parent commits"), // 父提交
    url: z.string().url().optional().describe("Commit URL"), // 提交 URL
    html_url: z.string().url().optional().describe("Commit HTML URL"), // 提交 HTML URL
    comments_url: z.string().url().optional().describe("Commit comments URL"), // 提交评论 URL
  }).describe("Commit information"),
});

export const GiteeIssueSchema = z.object({
  id: z.number().describe("Issue ID"), // Issue ID
  url: z.string().url().describe("Issue API URL"), // Issue API URL
  repository_url: z.string().url().describe("Repository URL"), // 仓库 URL
  labels_url: z.string().url().describe("Labels URL"), // 标签 URL
  comments_url: z.string().url().describe("Comments URL"), // 评论 URL
  html_url: z.string().url().describe("Issue HTML URL"), // Issue HTML URL
  number: z.union([z.number(), z.string()]).describe("Issue number, supports both number and string"), // Issue 编号，支持数字或字符串
  state: z.string().describe("Issue state"), // Issue 状态
  title: z.string().describe("Issue title"), // Issue 标题
  body: z.string().nullable().describe("Issue body"), // Issue 内容
  user: GiteeUserSchema.describe("Creator"), // 创建者
  labels: z.array(z.object({
    id: z.number().describe("Label ID"), // 标签 ID
    name: z.string().describe("Label name"), // 标签名称
    color: z.string().describe("Label color"), // 标签颜色
  })).describe("Labels list"), // 标签列表
  assignee: GiteeUserSchema.nullable().describe("Assignee"), // 指派者
  milestone: z.object({
    id: z.number().describe("Milestone ID"), // 里程碑 ID
    number: z.number().describe("Milestone number"), // 里程碑编号
    state: z.string().describe("Milestone state"), // 里程碑状态
    title: z.string().describe("Milestone title"), // 里程碑标题
    description: z.string().nullable().describe("Milestone description"), // 里程碑描述
    creator: GiteeUserSchema.describe("Milestone creator"), // 里程碑创建者
    open_issues: z.number().describe("Number of open issues"), // 开放的 Issue 数量
    closed_issues: z.number().describe("Number of closed issues"), // 关闭的 Issue 数量
    created_at: z.string().describe("Creation time"), // 创建时间
    updated_at: z.string().describe("Update time"), // 更新时间
    due_on: z.string().nullable().describe("Due date"), // 到期时间
  }).nullable().describe("Milestone"), // 里程碑
  created_at: z.string().describe("Creation time"), // 创建时间
  updated_at: z.string().describe("Update time"), // 更新时间
  closed_at: z.string().nullable().optional().describe("Close time"), // 关闭时间
  finished_at: z.string().nullable().optional().describe("Finish time"), // 完成时间
  plan_started_at: z.string().nullable().optional().describe("Planned start time"), // 计划开始时间
  deadline: z.string().nullable().optional().describe("Deadline"), // 截止时间
  security_hole: z.boolean().optional().describe("Whether the issue is private"), // 是否是私有 Issue
  // 添加 Gitee API 响应中可能包含的其他字段
  parent_url: z.string().nullable().optional().describe("Parent issue URL"), // 父 Issue URL
  parent_id: z.number().optional().describe("Parent issue ID"), // 父 Issue ID
  depth: z.number().optional().describe("Depth"), // 深度
  comments: z.number().optional().describe("Number of comments"), // 评论数量
  priority: z.number().optional().describe("Priority"), // 优先级
  issue_type: z.string().optional().describe("Issue type"), // Issue 类型
  program: z.any().nullable().optional().describe("Program"), // 项目
  issue_state: z.string().optional().describe("Issue state"), // Issue 状态
  branch: z.any().nullable().optional().describe("Branch"), // 分支
  scheduled_time: z.number().optional().describe("Scheduled time"), // 计划时间
  collaborators: z.array(z.any()).optional().describe("Collaborators"), // 协作者
  repository: z.any().optional().describe("Repository"), // 仓库
  issue_type_detail: z.any().optional().describe("Issue type details"), // Issue 类型详情
  issue_state_detail: z.any().optional().describe("Issue state details"), // Issue 状态详情
  assignees: z.union([z.array(z.any()), z.string(), z.null()]).optional().describe("Assignees"), // 指派者列表
});

export const GiteeIssueCommentSchema = z.object({
  id: z.number().describe("Comment ID"), // 评论 ID
  body: z.string().describe("Comment body"), // 评论内容
  user: GiteeUserSchema.describe("Comment author"), // 评论作者
  created_at: z.string().describe("Creation time"), // 创建时间
  updated_at: z.string().describe("Update time"), // 更新时间
  // HTML URL，可能不存在
  html_url: z.string().url().optional().describe("HTML URL"),
  // 目标对象，是一个对象，不是字符串
  target: z.object({
    issue: z.object({ // 目标 Issue
      id: z.number().describe("Issue ID"), // Issue ID
      title: z.string().describe("Issue title"), // Issue 标题
      number: z.string().describe("Issue number"), // Issue 编号，Gitee API 返回的 number 是字符串格式
    }).optional().describe("Target issue"),
    pull_request: z.any().nullable().describe("Target pull request"), // 目标 Pull Request
  }).describe("Target object"),
  // 源对象，可能为 null
  source: z.any().nullable().describe("Source object"),
});

export const GiteePullRequestSchema = z.object({
  id: z.number().describe("Pull request ID"), // Pull Request ID
  url: z.string().url().describe("Pull request API URL"), // Pull Request API URL
  html_url: z.string().url().describe("Pull request HTML URL"), // Pull Request HTML URL
  diff_url: z.string().url().optional().describe("Pull request diff URL"), // Pull Request 差异 URL
  patch_url: z.string().url().optional().describe("Pull request patch URL"), // Pull Request 补丁 URL
  issue_url: z.string().url().optional().describe("Related issue URL"), // 相关 Issue URL
  commits_url: z.string().url().optional().describe("Pull request commits URL"), // Pull Request 提交 URL
  review_comments_url: z.string().url().optional().describe("Pull request review comments URL"), // Pull Request 审查评论 URL
  review_comment_url: z.string().url().optional().describe("Pull request review comment URL"), // Pull Request 审查评论 URL
  comments_url: z.string().url().optional().describe("Pull request comments URL"), // Pull Request 评论 URL
  statuses_url: z.string().url().optional().describe("Pull request statuses URL"), // Pull Request 状态 URL
  number: z.number().describe("Pull request number"), // Pull Request 编号
  state: z.string().describe("Pull request state"), // Pull Request 状态
  title: z.string().describe("Pull request title"), // Pull Request 标题
  body: z.string().nullable().describe("Pull request body"), // Pull Request 内容
  assignees: z.array(GiteeUserSchema).optional().describe("Pull request assignees"), // Pull Request 指派者
  milestone: z.object({
    id: z.number().describe("Milestone ID"), // 里程碑 ID
    number: z.number().describe("Milestone number"), // 里程碑编号
    state: z.string().describe("Milestone state"), // 里程碑状态
    title: z.string().describe("Milestone title"), // 里程碑标题
    description: z.string().nullable().describe("Milestone description"), // 里程碑描述
    creator: GiteeUserSchema.describe("Milestone creator"), // 里程碑创建者
    open_issues: z.number().describe("Number of open issues"), // 开放的 Issue 数量
    closed_issues: z.number().describe("Number of closed issues"), // 关闭的 Issue 数量
    created_at: z.string().describe("Creation time"), // 创建时间
    updated_at: z.string().describe("Update time"), // 更新时间
    due_on: z.string().nullable().describe("Due date"), // 到期日期
  }).nullable().optional().describe("Pull request milestone"), // Pull Request 里程碑
  locked: z.boolean().optional().describe("Whether the pull request is locked"), // Pull Request 是否锁定
  created_at: z.string().describe("Creation time"), // 创建时间
  updated_at: z.string().describe("Update time"), // 更新时间
  closed_at: z.string().nullable().optional().describe("Closing time"), // 关闭时间
  merged_at: z.string().nullable().optional().describe("Merging time"), // 合并时间
  head: z.object({
    label: z.string().describe("Head branch label"), // 源分支标签
    ref: z.string().describe("Head branch reference"), // 源分支引用
    sha: z.string().describe("Head commit SHA"), // 源提交 SHA
    user: GiteeUserSchema.describe("Head branch owner"), // 源分支所有者
    repo: z.lazy(() => GiteeRepositorySchema).optional().describe("Head repository"), // 源仓库
  }).describe("Pull request head branch information"), // Pull Request 源分支信息
  base: z.object({
    label: z.string().describe("Base branch label"), // 目标分支标签
    ref: z.string().describe("Base branch reference"), // 目标分支引用
    sha: z.string().describe("Base commit SHA"), // 目标提交 SHA
    user: GiteeUserSchema.describe("Base branch owner"), // 目标分支所有者
    repo: z.lazy(() => GiteeRepositorySchema).optional().describe("Base repository"), // 目标仓库
  }).describe("Pull request base branch information"), // Pull Request 目标分支信息
  _links: z.object({
    self: z.object({
      href: z.string().url().describe("Self URL"),
    }).optional().describe("Self link"), // 自身链接
    html: z.object({
      href: z.string().url().describe("HTML URL"),
    }).optional().describe("HTML link"), // HTML 链接
    issue: z.object({
      href: z.string().url().describe("Issue URL"),
    }).optional().describe("Issue link"), // Issue 链接
    comments: z.object({
      href: z.string().url().describe("Comments URL"),
    }).optional().describe("Comments link"), // 评论链接
    review_comments: z.object({
      href: z.string().url().describe("Review comments URL"),
    }).optional().describe("Review comments link"), // 审查评论链接
    review_comment: z.object({
      href: z.string().url().describe("Review comment URL"),
    }).optional().describe("Review comment link"), // 审查评论链接
    commits: z.object({
      href: z.string().url().describe("Commits URL"),
    }).optional().describe("Commits link"), // 提交链接
    statuses: z.object({
      href: z.string().url().describe("Statuses URL"),
    }).optional().describe("Statuses link"), // 状态链接
  }).optional().describe("Pull request links"), // Pull Request 链接
  user: GiteeUserSchema.describe("Pull request creator"), // Pull Request 创建者
  merge_commit_sha: z.string().nullable().optional().describe("Merge commit SHA"), // 合并提交 SHA
  mergeable: z.boolean().nullable().optional().describe("Whether the pull request is mergeable"), // 是否可合并
});

// Type Exports
export type GiteeUser = z.infer<typeof GiteeUserSchema>;
export type GiteeRepository = z.infer<typeof GiteeRepositorySchema>;
export type GiteeBranch = z.infer<typeof GiteeBranchSchema>;
export type GiteeCompleteBranch = z.infer<typeof GiteeCompleteBranchSchema>;
export type GiteeCommit = z.infer<typeof GiteeCommitSchema>;
export type GiteeFileContent = z.infer<typeof GiteeFileContentSchema>;
export type GiteeDirectoryContent = z.infer<typeof GiteeDirectoryContentSchema>;
export type GiteeFileOperationResult = z.infer<typeof GiteeFileOperationResultSchema>;
export type GiteeIssue = z.infer<typeof GiteeIssueSchema>;
export type GiteeIssueComment = z.infer<typeof GiteeIssueCommentSchema>;
export type GiteePullRequest = z.infer<typeof GiteePullRequestSchema>;