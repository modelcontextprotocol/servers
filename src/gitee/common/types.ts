import { z } from "zod";

// Definition of Basic Types
export const GiteeUserSchema = z.object({
  // 用户在 Gitee 创建后产生的数字 ID，恒定不变，不是用户名
  id: z.number().describe("The digital ID generated for a user after creation on Gitee, which remains constant and is not the username."),
  // 用户登录名
  login: z.string().describe("User login name"),
  // 用户名称
  name: z.string().nullable().describe("User name"),
  // 用户头像 URL
  avatar_url: z.string().url().nullable().describe("User avatar URL"),
  // 用户 API URL
  url: z.string().url().describe("User API URL"),
  // 用户主页 URL
  html_url: z.string().url().describe("User homepage URL"),
  // 用户备注
  remark: z.string().nullable().describe("User remark"),
  // 用户关注者 URL
  followers_url: z.string().url().describe("User followers URL"),
  // 用户正在关注 URL
  following_url: z.string().url().describe("User following URL"),
  // 用户 Gists URL
  gists_url: z.string().url().describe("User gists URL"),
  // 用户星标 URL
  starred_url: z.string().url().describe("User starred URL"),
  // 用户订阅 URL
  subscriptions_url: z.string().url().describe("User subscriptions URL"),
  // 用户组织 URL
  organizations_url: z.string().url().describe("User organizations URL"),
  // 用户仓库 URL
  repos_url: z.string().url().describe("User repositories URL"),
  // 用户事件 URL
  events_url: z.string().url().describe("User events URL"),
  // 用户接收的事件 URL
  received_events_url: z.string().url().describe("User received events URL"),
  // 用户类型
  type: z.string().describe("User type"),
  // 是否是网站管理员
  site_admin: z.boolean().optional().default(false).describe("Whether the user is a site admin"),
  // 用户博客
  blog: z.string().nullable().optional().describe("User blog"),
  // 用户微博
  weibo: z.string().nullable().optional().describe("User Weibo"),
  // 用户简介
  bio: z.string().nullable().optional().describe("User bio"),
  // 公开仓库数量
  public_repos: z.number().optional().describe("Number of public repositories"),
  // 公开 Gists 数量
  public_gists: z.number().optional().describe("Number of public gists"),
  // 关注者数量
  followers: z.number().optional().describe("Number of followers"),
  // 正在关注数量
  following: z.number().optional().describe("Number of following"),
  // 星标数量
  stared: z.number().optional().describe("Number of stars"),
  // 关注数量
  watched: z.number().optional().describe("Number of watched repositories"),
  // 创建时间
  created_at: z.string().optional().describe("Creation time"),
  // 更新时间
  updated_at: z.string().optional().describe("Update time"),
  // 用户邮箱
  email: z.string().email().nullable().optional().describe("User email"),
});

// Declare a type and then define it to avoid circular references.
export type GiteeRepositorySchemaType = z.ZodObject<any>;
export let GiteeRepositorySchema: GiteeRepositorySchemaType;

GiteeRepositorySchema = z.object({
  // 仓库 ID
  id: z.number().describe("Repository ID"),
  // 仓库完整名称
  full_name: z.string().describe("Repository full name"),
  // 仓库人性化名称
  human_name: z.string().describe("Repository human-readable name"),
  // 仓库 API URL
  url: z.string().url().describe("Repository API URL"),
  // 命名空间信息
  namespace: z.object({
    // 命名空间 ID
    id: z.number().describe("Namespace ID"),
    // 命名空间名称
    name: z.string().describe("Namespace name"),
    // 命名空间路径
    path: z.string().describe("Namespace path"),
    // 命名空间类型
    type: z.string().describe("Namespace type"),
  }).describe("Repository namespace information"),
  // 仓库路径
  path: z.string().describe("Repository path"),
  // 仓库名称
  name: z.string().describe("Repository name"),
  // 仓库所有者
  owner: GiteeUserSchema.describe("Repository owner"),
  // 仓库指派者
  assigner: GiteeUserSchema.nullable().describe("Repository assigner"),
  // 仓库描述
  description: z.string().nullable().describe("Repository description"),
  // 是否私有
  private: z.boolean().describe("Whether the repository is private"),
  // 是否公开
  public: z.boolean().describe("Whether the repository is public"),
  // 是否内部的
  internal: z.boolean().describe("Whether the repository is internal"),
  // 是否是复刻的
  fork: z.boolean().describe("Whether the repository is forked"),
  // 仓库主页 URL
  html_url: z.string().url().describe("Repository homepage URL"),
  // 仓库 SSH URL
  ssh_url: z.string().describe("Repository SSH URL"),
  // 仓库复刻 URL
  forks_url: z.string().url().optional().describe("Repository forks URL"),
  // 仓库密钥 URL
  keys_url: z.string().url().optional().describe("Repository keys URL"),
  // 仓库协作者 URL
  collaborators_url: z.string().url().optional().describe("Repository collaborators URL"),
  // 仓库钩子 URL
  hooks_url: z.string().url().optional().describe("Repository hooks URL"),
  // 仓库分支 URL
  branches_url: z.string().url().optional().describe("Repository branches URL"),
  // 仓库标签 URL
  tags_url: z.string().url().optional().describe("Repository tags URL"),
  // 仓库 Blob URL
  blobs_url: z.string().url().optional().describe("Repository blobs URL"),
  // 仓库星标 URL
  stargazers_url: z.string().url().optional().describe("Repository stargazers URL"),
  // 仓库贡献者 URL
  contributors_url: z.string().url().optional().describe("Repository contributors URL"),
  // 仓库提交 URL
  commits_url: z.string().url().optional().describe("Repository commits URL"),
  // 仓库评论 URL
  comments_url: z.string().url().optional().describe("Repository comments URL"),
  // 仓库 Issue 评论 URL
  issue_comment_url: z.string().url().optional().describe("Repository issue comment URL"),
  // 仓库 Issues URL
  issues_url: z.string().url().optional().describe("Repository issues URL"),
  // 仓库 Pull Requests URL
  pulls_url: z.string().url().optional().describe("Repository pull requests URL"),
  // 仓库里程碑 URL
  milestones_url: z.string().url().optional().describe("Repository milestones URL"),
  // 仓库通知 URL
  notifications_url: z.string().url().optional().describe("Repository notifications URL"),
  // 仓库标签 URL
  labels_url: z.string().url().optional().describe("Repository labels URL"),
  // 仓库发行版 URL
  releases_url: z.string().url().optional().describe("Repository releases URL"),
  // 是否推荐
  recommend: z.boolean().optional().describe("Whether the repository is recommended"),
  // 是否 GVP 项目
  gvp: z.boolean().optional().describe("Whether the repository is a GVP project"),
  // 仓库主页
  homepage: z.string().nullable().optional().describe("Repository homepage"),
  // 仓库使用的语言
  language: z.string().nullable().optional().describe("Repository language"),
  // 复刻数量
  forks_count: z.number().optional().describe("Number of forks"),
  // 星标数量
  stargazers_count: z.number().optional().describe("Number of stars"),
  // 关注数量
  watchers_count: z.number().optional().describe("Number of watchers"),
  // 默认分支
  default_branch: z.string().nullable().optional().describe("Default branch"),
  // 开放的 Issue 数量
  open_issues_count: z.number().optional().describe("Number of open issues"),
  // 是否启用 Issue 功能
  has_issues: z.boolean().optional().describe("Whether issues are enabled"),
  // 是否启用 Wiki 功能
  has_wiki: z.boolean().optional().describe("Whether wiki is enabled"),
  // 是否启用 Issue 评论
  issue_comment: z.boolean().nullable().optional().describe("Whether issue comments are enabled"),
  // 是否可以评论
  can_comment: z.boolean().optional().describe("Whether comments are allowed"),
  // 是否启用 Pull Requests
  pull_requests_enabled: z.boolean().optional().describe("Whether pull requests are enabled"),
  // 是否有页面
  has_page: z.boolean().optional().describe("Whether pages are enabled"),
  // 许可证
  license: z.string().nullable().optional().describe("License"),
  // 是否外包
  outsourced: z.boolean().optional().describe("Whether the repository is outsourced"),
  // 项目创建者
  project_creator: z.string().optional().describe("Project creator"),
  // 成员
  members: z.array(z.string()).optional().describe("Members"),
  // 推送时间
  pushed_at: z.string().nullable().optional().describe("Push time"),
  // 创建时间
  created_at: z.string().optional().describe("Creation time"),
  // 更新时间
  updated_at: z.string().optional().describe("Update time"),
  // 父仓库
  parent: z.lazy(() => GiteeRepositorySchema).nullable().optional().describe("Parent repository"),
  // PaaS 平台
  paas: z.string().nullable().optional().describe("PaaS platform"),
  // 指派者数量
  assignees_number: z.number().optional().describe("Number of assignees"),
  // 测试者数量
  testers_number: z.number().optional().describe("Number of testers"),
  // 指派者
  assignee: z.union([GiteeUserSchema, z.array(z.any()), z.null()]).optional().describe("Assignee"),
  // 企业信息
  enterprise: z.object({
    // 企业 ID
    id: z.number().describe("Enterprise ID"),
    // 企业名称
    name: z.string().describe("Enterprise name"),
    // 企业 URL
    url: z.string().url().describe("Enterprise URL"),
  }).nullable().optional().describe("Enterprise information"),
  // 权限信息
  permission: z.object({
    // 是否有拉取权限
    pull: z.boolean().describe("Whether pull permission is granted"),
    // 是否有推送权限
    push: z.boolean().describe("Whether push permission is granted"),
    // 是否有管理权限
    admin: z.boolean().describe("Whether admin permission is granted"),
  }).optional().describe("Permission information"),
});

export const GiteeBranchSchema = z.object({
  // 分支名称
  name: z.string().describe("Branch name"),
  // 提交信息
  commit: z.object({
    // 提交 SHA
    sha: z.string().describe("Commit SHA"),
    // 提交 URL
    url: z.string().url().describe("Commit URL"),
  }).describe("Commit information"),
  // 是否受保护
  protected: z.boolean().describe("Whether the branch is protected"),
  // 保护 URL
  protection_url: z.string().url().optional().describe("Protection URL"),
});

export const GiteeCompleteBranchSchema = GiteeBranchSchema.extend({
  // 链接信息
  _links: z.object({
    // 自身 URL
    self: z.string().url().describe("Self URL"),
    // HTML URL
    html: z.string().url().describe("HTML URL"),
  }).describe("Links information"),
});

export const GiteeCommitSchema = z.object({
  // 提交 API URL
  url: z.string().url().describe("Commit API URL"),
  // 提交 SHA
  sha: z.string().describe("Commit SHA"),
  // 提交 HTML URL
  html_url: z.string().url().describe("Commit HTML URL"),
  // 提交评论 URL
  comments_url: z.string().url().describe("Commit comments URL"),
  // 提交详细信息
  commit: z.object({
    // 提交 URL
    url: z.string().url().describe("Commit URL"),
    // 作者信息
    author: z.object({
      // 作者名称
      name: z.string().describe("Author name"),
      // 作者邮箱
      email: z.string().email().describe("Author email"),
      // 作者日期
      date: z.string().describe("Author date"),
    }).describe("Author information"),
    // 提交者信息
    committer: z.object({
      // 提交者名称
      name: z.string().describe("Committer name"),
      // 提交者邮箱
      email: z.string().email().describe("Committer email"),
      // 提交日期
      date: z.string().describe("Commit date"),
    }).describe("Committer information"),
    // 提交信息
    message: z.string().describe("Commit message"),
    // 树信息
    tree: z.object({
      // 树 URL
      url: z.string().url().describe("Tree URL"),
      // 树 SHA
      sha: z.string().describe("Tree SHA"),
    }).describe("Tree information"),
  }).describe("Commit details"),
  // 作者用户信息
  author: GiteeUserSchema.nullable().describe("Author user information"),
  // 提交者用户信息
  committer: GiteeUserSchema.nullable().describe("Committer user information"),
  // 父提交
  parents: z.array(z.object({
    // 父提交 URL
    url: z.string().url().describe("Parent commit URL"),
    // 父提交 SHA
    sha: z.string().describe("Parent commit SHA"),
  })).describe("Parent commits"),
});

export const GiteeFileContentSchema = z.object({
  // 文件类型
  type: z.string().describe("File type"),
  // 编码方式
  encoding: z.string().optional().describe("Encoding method"),
  // 文件大小
  size: z.number().describe("File size"),
  // 文件名
  name: z.string().describe("File name"),
  // 文件路径
  path: z.string().describe("File path"),
  // 文件内容
  content: z.string().optional().describe("File content"),
  // 文件 SHA
  sha: z.string().describe("File SHA"),
  // 文件 API URL
  url: z.string().url().describe("File API URL"),
  // 文件 HTML URL
  html_url: z.string().url().nullable().describe("File HTML URL"),
  // 文件下载 URL
  download_url: z.string().url().nullable().describe("File download URL"),
  // 链接信息
  _links: z.object({
    // 自身 URL
    self: z.string().url().describe("Self URL"),
    // HTML URL
    html: z.string().url().nullable().describe("HTML URL"),
  }).describe("Links information"),
});

export const GiteeDirectoryContentSchema = z.array(z.object({
  // 目录项类型
  type: z.string().describe("Directory item type"),
  // 目录项大小
  size: z.number().describe("Directory item size"),
  // 目录项名称
  name: z.string().describe("Directory item name"),
  // 目录项路径
  path: z.string().describe("Directory item path"),
  // 目录项 SHA
  sha: z.string().describe("Directory item SHA"),
  // 目录项 API URL
  url: z.string().url().describe("Directory item API URL"),
  // 目录项 HTML URL
  html_url: z.string().url().nullable().describe("Directory item HTML URL"),
  // 目录项下载 URL
  download_url: z.string().url().nullable().describe("Directory item download URL"),
  // 链接信息
  _links: z.object({
    // 自身 URL
    self: z.string().url().describe("Self URL"),
    // HTML URL
    html: z.string().url().nullable().describe("HTML URL"),
  }).describe("Links information"),
}));

export const GiteeFileOperationResultSchema = z.object({
  // 文件内容
  content: GiteeFileContentSchema.nullable().describe("File content"),
  // 提交信息
  commit: z.object({
    // 提交 SHA
    sha: z.string().describe("Commit SHA"),
    // 作者信息
    author: z.object({
      // 作者名称
      name: z.string().describe("Author name"),
      // 作者邮箱
      email: z.string().email().describe("Author email"),
      // 提交日期
      date: z.string().describe("Commit date"),
    }).describe("Author information"),
    // 提交者信息
    committer: z.object({
      // 提交者名称
      name: z.string().describe("Committer name"),
      // 提交者邮箱
      email: z.string().email().describe("Committer email"),
      // 提交日期
      date: z.string().describe("Commit date"),
    }).describe("Committer information"),
    // 提交信息
    message: z.string().describe("Commit message"),
    // 树信息
    tree: z.object({
      // 树 SHA
      sha: z.string().describe("Tree SHA"),
      // 树 URL
      url: z.string().url().describe("Tree URL"),
    }).describe("Tree information"),
    // 父提交
    parents: z.array(z.object({
      // 父提交 SHA
      sha: z.string().describe("Parent commit SHA"),
      // 父提交 URL
      url: z.string().url().describe("Parent commit URL"),
      // 父提交 HTML URL
      html_url: z.string().url().optional().describe("Parent commit HTML URL"),
    })).describe("Parent commits"),
    // 提交 URL
    url: z.string().url().optional().describe("Commit URL"),
    // 提交 HTML URL
    html_url: z.string().url().optional().describe("Commit HTML URL"),
    // 提交评论 URL
    comments_url: z.string().url().optional().describe("Commit comments URL"),
  }).describe("Commit information"),
});

export const GiteeIssueSchema = z.object({
  // Issue ID
  id: z.number().describe("Issue ID"),
  // Issue API URL
  url: z.string().url().describe("Issue API URL"),
  // 仓库 URL
  repository_url: z.string().url().describe("Repository URL"),
  // 标签 URL
  labels_url: z.string().url().describe("Labels URL"),
  // 评论 URL
  comments_url: z.string().url().describe("Comments URL"),
  // Issue HTML URL
  html_url: z.string().url().describe("Issue HTML URL"),
  // Issue 编号，支持数字或字符串
  number: z.union([z.number(), z.string()]).describe("Issue number, supports both number and string"),
  // Issue 状态
  state: z.string().describe("Issue state"),
  // Issue 标题
  title: z.string().describe("Issue title"),
  // Issue 内容
  body: z.string().nullable().describe("Issue body"),
  // 创建者
  user: GiteeUserSchema.describe("Creator"),
  // 标签列表
  labels: z.array(z.object({
    // 标签 ID
    id: z.number().describe("Label ID"),
    // 标签名称
    name: z.string().describe("Label name"),
    // 标签颜色
    color: z.string().describe("Label color"),
  })).describe("Labels list"),
  // 指派者
  assignee: GiteeUserSchema.nullable().describe("Assignee"),
  // 里程碑
  milestone: z.object({
    // 里程碑 ID
    id: z.number().describe("Milestone ID"),
    // 里程碑编号
    number: z.number().describe("Milestone number"),
    // 里程碑状态
    state: z.string().describe("Milestone state"),
    // 里程碑标题
    title: z.string().describe("Milestone title"),
    // 里程碑描述
    description: z.string().nullable().describe("Milestone description"),
    // 里程碑创建者
    creator: GiteeUserSchema.describe("Milestone creator"),
    // 开放的 Issue 数量
    open_issues: z.number().describe("Number of open issues"),
    // 关闭的 Issue 数量
    closed_issues: z.number().describe("Number of closed issues"),
    // 创建时间
    created_at: z.string().describe("Creation time"),
    // 更新时间
    updated_at: z.string().describe("Update time"),
    // 到期时间
    due_on: z.string().nullable().describe("Due date"),
  }).nullable().describe("Milestone"),
  // 创建时间
  created_at: z.string().describe("Creation time"),
  // 更新时间
  updated_at: z.string().describe("Update time"),
  // 关闭时间
  closed_at: z.string().nullable().optional().describe("Close time"),
  // 完成时间
  finished_at: z.string().nullable().optional().describe("Finish time"),
  // 计划开始时间
  plan_started_at: z.string().nullable().optional().describe("Planned start time"),
  // 截止时间
  deadline: z.string().nullable().optional().describe("Deadline"),
  // 是否是私有 Issue
  security_hole: z.boolean().optional().describe("Whether the issue is private"),
  // 添加 Gitee API 响应中可能包含的其他字段
  // 父 Issue URL
  parent_url: z.string().nullable().optional().describe("Parent issue URL"),
  // 父 Issue ID
  parent_id: z.number().optional().describe("Parent issue ID"),
  // 深度
  depth: z.number().optional().describe("Depth"),
  // 评论数量
  comments: z.number().optional().describe("Number of comments"),
  // 优先级
  priority: z.number().optional().describe("Priority"),
  // Issue 类型
  issue_type: z.string().optional().describe("Issue type"),
  // 项目
  program: z.any().nullable().optional().describe("Program"),
  // Issue 状态
  issue_state: z.string().optional().describe("Issue state"),
  // 分支
  branch: z.any().nullable().optional().describe("Branch"),
  // 计划时间
  scheduled_time: z.number().optional().describe("Scheduled time"),
  // 协作者
  collaborators: z.array(z.any()).optional().describe("Collaborators"),
  // 仓库
  repository: z.any().optional().describe("Repository"),
  // Issue 类型详情
  issue_type_detail: z.any().optional().describe("Issue type details"),
  // Issue 状态详情
  issue_state_detail: z.any().optional().describe("Issue state details"),
  // 指派者列表
  assignees: z.union([z.array(z.any()), z.string(), z.null()]).optional().describe("Assignees"),
});

export const GiteeIssueCommentSchema = z.object({
  // 评论 ID
  id: z.number().describe("Comment ID"),
  // 评论内容
  body: z.string().describe("Comment body"),
  // 评论作者
  user: GiteeUserSchema.describe("Comment author"),
  // 创建时间
  created_at: z.string().describe("Creation time"),
  // 更新时间
  updated_at: z.string().describe("Update time"),
  // HTML URL，可能不存在
  html_url: z.string().url().optional().describe("HTML URL"),
  // 目标对象，是一个对象，不是字符串
  target: z.object({
    // 目标 Issue
    issue: z.object({
      // Issue ID
      id: z.number().describe("Issue ID"),
      // Issue 标题
      title: z.string().describe("Issue title"),
      // Issue 编号，Gitee API 返回的 number 是字符串格式
      number: z.string().describe("Issue number"),
    }).optional().describe("Target issue"),
    // 目标 Pull Request
    pull_request: z.any().nullable().describe("Target pull request"),
  }).describe("Target object"),
  // 源对象，可能为 null
  source: z.any().nullable().describe("Source object"),
});

export const GiteePullRequestSchema = z.object({
  id: z.number(),
  url: z.string().url(),
  html_url: z.string().url(),
  diff_url: z.string().url().optional(),
  patch_url: z.string().url().optional(),
  issue_url: z.string().url().optional(),
  commits_url: z.string().url().optional(),
  review_comments_url: z.string().url().optional(),
  review_comment_url: z.string().url().optional(),
  comments_url: z.string().url().optional(),
  statuses_url: z.string().url().optional(),
  number: z.number(),
  state: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  assignees: z.array(GiteeUserSchema).optional(),
  milestone: z.object({
    id: z.number(),
    number: z.number(),
    state: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    creator: GiteeUserSchema,
    open_issues: z.number(),
    closed_issues: z.number(),
    created_at: z.string(),
    updated_at: z.string(),
    due_on: z.string().nullable(),
  }).nullable().optional(),
  locked: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable().optional(),
  merged_at: z.string().nullable().optional(),
  head: z.object({
    label: z.string(),
    ref: z.string(),
    sha: z.string(),
    user: GiteeUserSchema,
    repo: z.lazy(() => GiteeRepositorySchema).optional(),
  }),
  base: z.object({
    label: z.string(),
    ref: z.string(),
    sha: z.string(),
    user: GiteeUserSchema,
    repo: z.lazy(() => GiteeRepositorySchema).optional(),
  }),
  _links: z.object({
    self: z.object({
      href: z.string().url(),
    }).optional(),
    html: z.object({
      href: z.string().url(),
    }).optional(),
    issue: z.object({
      href: z.string().url(),
    }).optional(),
    comments: z.object({
      href: z.string().url(),
    }).optional(),
    review_comments: z.object({
      href: z.string().url(),
    }).optional(),
    review_comment: z.object({
      href: z.string().url(),
    }).optional(),
    commits: z.object({
      href: z.string().url(),
    }).optional(),
    statuses: z.object({
      href: z.string().url(),
    }).optional(),
  }).optional(),
  user: GiteeUserSchema,
  merge_commit_sha: z.string().nullable().optional(),
  mergeable: z.boolean().nullable().optional(),
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