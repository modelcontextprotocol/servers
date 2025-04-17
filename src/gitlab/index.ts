#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  GitLabForkSchema,
  GitLabReferenceSchema,
  GitLabRepositorySchema,
  GitLabIssueSchema,
  GitLabMergeRequestSchema,
  GitLabContentSchema,
  GitLabCreateUpdateFileResponseSchema,
  GitLabSearchResponseSchema,
  GitLabTreeSchema,
  GitLabCommitSchema,
  GitLabNoteSchema,
  GitLabMergeRequestChangesSchema,
  GitLabMergeRequestVersionSchema,
  GitLabMergeRequestVersionDetailSchema,
  CreateRepositoryOptionsSchema,
  CreateIssueOptionsSchema,
  CreateMergeRequestOptionsSchema,
  CreateBranchOptionsSchema,
  CreateOrUpdateFileSchema,
  SearchRepositoriesSchema,
  CreateRepositorySchema,
  GetFileContentsSchema,
  PushFilesSchema,
  CreateIssueSchema,
  CreateMergeRequestSchema,
  CreateMergeRequestCommentSchema,
  GetMergeRequestChangesSchema,
  ForkRepositorySchema,
  CreateBranchSchema,
  GetProjectIdFromMrUrlInputSchema,
  GetProjectIdFromMrUrlOutputSchema,
  CreateMergeRequestDiffThreadSchema,
  type GitLabFork,
  type GitLabReference,
  type GitLabRepository,
  type GitLabIssue,
  type GitLabMergeRequest,
  type GitLabContent,
  type GitLabCreateUpdateFileResponse,
  type GitLabSearchResponse,
  type GitLabTree,
  type GitLabCommit,
  type GitLabNote,
  type GitLabMergeRequestChanges,
  type GitLabMergeRequestVersion,
  type GitLabMergeRequestVersionDetail,
  type FileOperation,
  type GetProjectIdFromMrUrlInput,
  type GetProjectIdFromMrUrlOutput,
  type CreateMergeRequestDiffThreadInput,
} from './schemas.js';

const server = new Server({
  name: "gitlab-mcp-server",
  version: "0.5.1",
}, {
  capabilities: {
    tools: {}
  }
});

const GITLAB_PERSONAL_ACCESS_TOKEN = process.env.GITLAB_PERSONAL_ACCESS_TOKEN;
const GITLAB_API_URL = process.env.GITLAB_API_URL || 'https://gitlab.com/api/v4';

if (!GITLAB_PERSONAL_ACCESS_TOKEN) {
  console.error("GITLAB_PERSONAL_ACCESS_TOKEN environment variable is not set");
  process.exit(1);
}

async function forkProject(
  projectId: string,
  namespace?: string
): Promise<GitLabFork> {
  const url = `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/fork`;
  const queryParams = namespace ? `?namespace=${encodeURIComponent(namespace)}` : '';

  const response = await fetch(url + queryParams, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabForkSchema.parse(await response.json());
}

async function createBranch(
  projectId: string,
  options: z.infer<typeof CreateBranchOptionsSchema>
): Promise<GitLabReference> {
  const response = await fetch(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/repository/branches`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        branch: options.name,
        ref: options.ref
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabReferenceSchema.parse(await response.json());
}

async function getFileContents(
  projectId: string,
  filePath: string,
  ref?: string
): Promise<GitLabContent> {
  const encodedPath = encodeURIComponent(filePath);
  let url = `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/repository/files/${encodedPath}`;
  if (ref) {
    url += `?ref=${encodeURIComponent(ref)}`;
  } else {
    url += '?ref=HEAD';
  }

  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`
    }
  });

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  const data = GitLabContentSchema.parse(await response.json());

  if (!Array.isArray(data) && data.content) {
    data.content = Buffer.from(data.content, 'base64').toString('utf8');
  }

  return data;
}

async function createIssue(
  projectId: string,
  options: z.infer<typeof CreateIssueOptionsSchema>
): Promise<GitLabIssue> {
  const response = await fetch(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/issues`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: options.title,
        description: options.description,
        assignee_ids: options.assignee_ids,
        milestone_id: options.milestone_id,
        labels: options.labels?.join(',')
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabIssueSchema.parse(await response.json());
}

async function createMergeRequest(
  projectId: string,
  options: z.infer<typeof CreateMergeRequestOptionsSchema>
): Promise<GitLabMergeRequest> {
  const response = await fetch(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/merge_requests`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: options.title,
        description: options.description,
        source_branch: options.source_branch,
        target_branch: options.target_branch,
        allow_collaboration: options.allow_collaboration,
        draft: options.draft
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabMergeRequestSchema.parse(await response.json());
}

async function createMergeRequestComment(
  projectId: string,
  mergeRequestIid: number,
  body: string,
  createdAt?: string
): Promise<GitLabNote> {
  const url = `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/merge_requests/${mergeRequestIid}/notes`;

  const requestBody: Record<string, any> = { body };
  if (createdAt) {
    requestBody.created_at = createdAt;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabNoteSchema.parse(await response.json());
}

async function getMergeRequestVersions(
  projectId: string,
  mergeRequestIid: number
): Promise<GitLabMergeRequestVersion[]> {
  const url = `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/merge_requests/${mergeRequestIid}/versions`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return z.array(GitLabMergeRequestVersionSchema).parse(await response.json());
}

async function getMergeRequestVersionDetail(
  projectId: string,
  mergeRequestIid: number,
  versionId: number
): Promise<GitLabMergeRequestVersionDetail> {
  const url = `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/merge_requests/${mergeRequestIid}/versions/${versionId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabMergeRequestVersionDetailSchema.parse(await response.json());
}

async function getMergeRequestChanges(
  projectId: string,
  mergeRequestIid: number
): Promise<GitLabMergeRequestChanges> {
  try {
    // 首先获取合并请求的版本列表
    const versions = await getMergeRequestVersions(projectId, mergeRequestIid);

    if (versions.length === 0) {
      throw new Error(`No versions found for merge request ${mergeRequestIid}`);
    }

    // 获取最新版本的详细信息
    const latestVersion = versions[0]; // 版本按时间降序排列，第一个是最新的
    const versionDetail = await getMergeRequestVersionDetail(projectId, mergeRequestIid, latestVersion.id);

    // 构建返回结果
    const changes = versionDetail.diffs || [];

    return {
      changes
    };
  } catch (error) {
    // 如果上述方法失败，回退到直接获取变更的方法
    console.error("Error getting merge request changes using versions API:", error);
    console.log("Falling back to direct changes API...");

    const url = `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/merge_requests/${mergeRequestIid}/changes`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.statusText}`);
    }

    return GitLabMergeRequestChangesSchema.parse(await response.json());
  }
}

async function createOrUpdateFile(
  projectId: string,
  filePath: string,
  content: string,
  commitMessage: string,
  branch: string,
  previousPath?: string
): Promise<GitLabCreateUpdateFileResponse> {
  const encodedPath = encodeURIComponent(filePath);
  const url = `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/repository/files/${encodedPath}`;

  const body = {
    branch,
    content,
    commit_message: commitMessage,
    ...(previousPath ? { previous_path: previousPath } : {})
  };

  // Check if file exists
  let method = "POST";
  try {
    await getFileContents(projectId, filePath, branch);
    method = "PUT";
  } catch (error) {
    // File doesn't exist, use POST
  }

  const response = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabCreateUpdateFileResponseSchema.parse(await response.json());
}

async function createTree(
  projectId: string,
  files: FileOperation[],
  ref?: string
): Promise<GitLabTree> {
  const response = await fetch(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/repository/tree`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files: files.map(file => ({
          file_path: file.path,
          content: file.content
        })),
        ...(ref ? { ref } : {})
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabTreeSchema.parse(await response.json());
}

async function createCommit(
  projectId: string,
  message: string,
  branch: string,
  actions: FileOperation[]
): Promise<GitLabCommit> {
  const response = await fetch(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/repository/commits`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        branch,
        commit_message: message,
        actions: actions.map(action => ({
          action: "create",
          file_path: action.path,
          content: action.content
        }))
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabCommitSchema.parse(await response.json());
}

async function searchProjects(
  query: string,
  page: number = 1,
  perPage: number = 20
): Promise<GitLabSearchResponse> {
  const url = new URL(`${GITLAB_API_URL}/projects`);
  url.searchParams.append("search", query);
  url.searchParams.append("page", page.toString());
  url.searchParams.append("per_page", perPage.toString());

  const response = await fetch(url.toString(), {
    headers: {
      "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`
    }
  });

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  const projects = await response.json();
  return GitLabSearchResponseSchema.parse({
    count: parseInt(response.headers.get("X-Total") || "0"),
    items: projects
  });
}

async function createRepository(
  options: z.infer<typeof CreateRepositoryOptionsSchema>
): Promise<GitLabRepository> {
  const response = await fetch(`${GITLAB_API_URL}/projects`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: options.name,
      description: options.description,
      visibility: options.visibility,
      initialize_with_readme: options.initialize_with_readme
    })
  });

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  return GitLabRepositorySchema.parse(await response.json());
}

// Helper function to parse MR URL and get project ID
async function getProjectIdFromMrUrl(mrUrl: string): Promise<number> {
  let url: URL;
  try {
    url = new URL(mrUrl);
  } catch (e) {
    throw new Error(`Invalid MR URL format: ${mrUrl}`);
  }

  const pathParts = url.pathname.split('/').filter(part => part && part !== '-');

  if (pathParts.length < 4 || pathParts[pathParts.length - 2] !== 'merge_requests') {
    throw new Error(`Could not parse namespace and project path from MR URL: ${mrUrl}`);
  }

  // Find the index of 'merge_requests'
  const mrIndex = pathParts.lastIndexOf('merge_requests');
  if (mrIndex < 2) { // Need at least namespace and project before 'merge_requests'
      throw new Error(`Could not parse namespace and project path from MR URL: ${mrUrl}`);
  }

  // Join parts before 'merge_requests' to get the full path with namespace
  const projectPathWithNamespace = pathParts.slice(0, mrIndex).join('/');
  const encodedProjectPath = encodeURIComponent(projectPathWithNamespace);

  const apiUrl = `${GITLAB_API_URL}/projects/${encodedProjectPath}`;

  const response = await fetch(apiUrl, {
    headers: {
      "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Project not found for path: ${projectPathWithNamespace}`);
    }
    throw new Error(`GitLab API error (${response.status}): ${response.statusText}`);
  }

  const project = GitLabRepositorySchema.parse(await response.json());
  return project.id;
}

// Function to create a diff thread on an MR
async function createMergeRequestDiffThread(
  projectId: string,
  mergeRequestIid: number,
  body: string,
  position: CreateMergeRequestDiffThreadInput['position'], // Use the inferred type
  commitId?: string // Optional commit ID
): Promise<any> { // Define a proper response schema if available, using 'any' for now
  const url = `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/merge_requests/${mergeRequestIid}/discussions`;

  const requestBody: any = {
    body,
    position: {
      position_type: position.position_type,
      base_sha: position.base_sha,
      start_sha: position.start_sha,
      head_sha: position.head_sha,
      old_path: position.old_path,
      new_path: position.new_path,
      new_line: position.new_line,
      ...(position.old_line !== undefined && { old_line: position.old_line }), // Include old_line only if present
    }
  };

  // Note: GitLab API for creating discussion with position usually infers context from SHAs.
  // Explicit commit_id might be handled differently or might not be needed if position SHAs are correct.
  // Sticking to the documented 'position' object structure for now.

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("GitLab API Error Response:", errorText);
    throw new Error(`GitLab API error (${response.status}): ${response.statusText}. Details: ${errorText}`);
  }

  // Assuming the response is the created discussion object
  return await response.json();
}


server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_or_update_file",
        description: "Create or update a single file in a GitLab project",
        inputSchema: zodToJsonSchema(CreateOrUpdateFileSchema)
      },
      {
        name: "search_repositories",
        description: "Search for GitLab projects",
        inputSchema: zodToJsonSchema(SearchRepositoriesSchema)
      },
      {
        name: "create_repository",
        description: "Create a new GitLab project",
        inputSchema: zodToJsonSchema(CreateRepositorySchema)
      },
      {
        name: "get_file_contents",
        description: "Get the contents of a file or directory from a GitLab project",
        inputSchema: zodToJsonSchema(GetFileContentsSchema)
      },
      {
        name: "push_files",
        description: "Push multiple files to a GitLab project in a single commit",
        inputSchema: zodToJsonSchema(PushFilesSchema)
      },
      {
        name: "create_issue",
        description: "Create a new issue in a GitLab project",
        inputSchema: zodToJsonSchema(CreateIssueSchema)
      },
      {
        name: "create_merge_request",
        description: "Create a new merge request in a GitLab project",
        inputSchema: zodToJsonSchema(CreateMergeRequestSchema)
      },
      {
        name: "create_merge_request_comment",
        description: "Create a new comment on a merge request in a GitLab project",
        inputSchema: zodToJsonSchema(CreateMergeRequestCommentSchema)
      },
      {
        name: "get_merge_request_changes",
        description: "Get the changes (diffs) of a merge request in a GitLab project",
        inputSchema: zodToJsonSchema(GetMergeRequestChangesSchema)
      },
      {
        name: "fork_repository",
        description: "Fork a GitLab project to your account or specified namespace",
        inputSchema: zodToJsonSchema(ForkRepositorySchema)
      },
      {
        name: "create_branch",
        description: "Create a new branch in a GitLab project",
        inputSchema: zodToJsonSchema(CreateBranchSchema)
      },
      {
        name: "get_project_id_from_mr_url",
        description: "Parses a GitLab Merge Request URL to find and return the corresponding project ID",
        inputSchema: zodToJsonSchema(GetProjectIdFromMrUrlInputSchema),
        outputSchema: zodToJsonSchema(GetProjectIdFromMrUrlOutputSchema)
      },
      {
        name: "create_merge_request_diff_thread",
        description: "Create a new diff thread (comment) on a GitLab Merge Request",
        inputSchema: zodToJsonSchema(CreateMergeRequestDiffThreadSchema)
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    switch (request.params.name) {
      case "fork_repository": {
        const args = ForkRepositorySchema.parse(request.params.arguments);
        const fork = await forkProject(args.project_id, args.namespace);
        return { content: [{ type: "text", text: JSON.stringify(fork, null, 2) }] };
      }

      case "create_branch": {
        const args = CreateBranchSchema.parse(request.params.arguments);
        let ref = args.ref;
        if (!ref) {
          ref = "HEAD";
        }

        const branch = await createBranch(args.project_id, {
          name: args.branch,
          ref
        });

        return { content: [{ type: "text", text: JSON.stringify(branch, null, 2) }] };
      }

      case "search_repositories": {
        const args = SearchRepositoriesSchema.parse(request.params.arguments);
        const results = await searchProjects(args.search, args.page, args.per_page);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "create_repository": {
        const args = CreateRepositorySchema.parse(request.params.arguments);
        const repository = await createRepository(args);
        return { content: [{ type: "text", text: JSON.stringify(repository, null, 2) }] };
      }

      case "get_file_contents": {
        const args = GetFileContentsSchema.parse(request.params.arguments);
        const contents = await getFileContents(args.project_id, args.file_path, args.ref);
        return { content: [{ type: "text", text: JSON.stringify(contents, null, 2) }] };
      }

      case "create_or_update_file": {
        const args = CreateOrUpdateFileSchema.parse(request.params.arguments);
        const result = await createOrUpdateFile(
          args.project_id,
          args.file_path,
          args.content,
          args.commit_message,
          args.branch,
          args.previous_path
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "push_files": {
        const args = PushFilesSchema.parse(request.params.arguments);
        const result = await createCommit(
          args.project_id,
          args.commit_message,
          args.branch,
          args.files.map(f => ({ path: f.file_path, content: f.content }))
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "create_issue": {
        const args = CreateIssueSchema.parse(request.params.arguments);
        const { project_id, ...options } = args;
        const issue = await createIssue(project_id, options);
        return { content: [{ type: "text", text: JSON.stringify(issue, null, 2) }] };
      }

      case "create_merge_request": {
        const args = CreateMergeRequestSchema.parse(request.params.arguments);
        const { project_id, ...options } = args;
        const mergeRequest = await createMergeRequest(project_id, options);
        return { content: [{ type: "text", text: JSON.stringify(mergeRequest, null, 2) }] };
      }

      case "create_merge_request_comment": {
        const args = CreateMergeRequestCommentSchema.parse(request.params.arguments);
        const comment = await createMergeRequestComment(
          args.project_id,
          args.merge_request_iid,
          args.body,
          args.created_at
        );
        return { content: [{ type: "text", text: JSON.stringify(comment, null, 2) }] };
      }

      case "get_merge_request_changes": {
        const args = GetMergeRequestChangesSchema.parse(request.params.arguments);
        const changes = await getMergeRequestChanges(
          args.project_id,
          args.merge_request_iid
        );
        return { content: [{ type: "text", text: JSON.stringify(changes, null, 2) }] };
      }

      case "get_project_id_from_mr_url": {
        const args = GetProjectIdFromMrUrlInputSchema.parse(request.params.arguments);
        const projectId = await getProjectIdFromMrUrl(args.mr_url);
        const result: GetProjectIdFromMrUrlOutput = { project_id: projectId };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }; // Return stringified JSON as text
      }

      case "create_merge_request_diff_thread": {
        const args = CreateMergeRequestDiffThreadSchema.parse(request.params.arguments);
        const discussion = await createMergeRequestDiffThread(
          args.project_id,
          args.merge_request_iid,
          args.body,
          args.position,
          args.commit_id // Pass commit_id although the function might not use it directly yet
        );
        return { content: [{ type: "text", text: JSON.stringify(discussion, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid arguments: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    }
    throw error;
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitLab MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});