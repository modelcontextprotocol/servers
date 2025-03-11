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
  GitLabCommentSchema,
  GitLabEpicSchema,
  GitLabUserSchema,
  GitLabIssueDetailsSchema,
  GitLabMergeRequestDetailsSchema,
  GitLabEpicDetailsSchema,
  GitLabEventSchema,
  GitLabUserActivitySchema,
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
  ForkRepositorySchema,
  CreateBranchSchema,
  GetIssueDetailsSchema,
  GetMergeRequestDetailsSchema,
  GetEpicDetailsSchema,
  GetUserActivitySchema,
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
  type GitLabComment,
  type GitLabEpic,
  type GitLabIssueDetails,
  type GitLabMergeRequestDetails,
  type GitLabEpicDetails,
  type GitLabEvent,
  type GitLabUserActivity,
  type FileOperation,
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

async function getDefaultBranchRef(projectId: string): Promise<string> {
  const response = await fetch(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}`,
    {
      headers: {
        "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.statusText}`);
  }

  const project = GitLabRepositorySchema.parse(await response.json());
  if (!project.default_branch) {
    throw new Error(`Could not determine default branch for project ${projectId}`);
  }
  return project.default_branch;
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

async function getIssueComments(
  projectId: string,
  issueIid: number
): Promise<GitLabComment[]> {
  try {
    const url = `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/issues/${issueIid}/notes`;
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.statusText}`);
    }

    const responseData = await response.json() as unknown[];
    
    // Process response data to ensure comment text is included
    const comments = (responseData as any[]).map(comment => {
      // Determine the actual comment content from available fields
      const content = comment.body || comment.note || '';
      
      return {
        id: comment.id,
        // Only include content field to avoid duplication
        content,
        author: comment.author,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        system: comment.system,
        noteable_id: comment.noteable_id,
        noteable_type: comment.noteable_type,
        web_url: comment.web_url
      };
    });
    
    return comments;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Comment schema validation error:', JSON.stringify(error.errors, null, 2));
    }
    throw error;
  }
}

async function getMergeRequestComments(
  projectId: string,
  mergeRequestIid: number
): Promise<GitLabComment[]> {
  try {
    const url = `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/merge_requests/${mergeRequestIid}/notes`;
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.statusText}`);
    }

    const responseData = await response.json() as unknown[];
    
    // Process response data to ensure comment text is included
    const comments = (responseData as any[]).map(comment => {
      // Determine the actual comment content from available fields
      const content = comment.body || comment.note || '';
      
      return {
        id: comment.id,
        // Only include content field to avoid duplication
        content,
        author: comment.author,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        system: comment.system,
        noteable_id: comment.noteable_id,
        noteable_type: comment.noteable_type,
        web_url: comment.web_url,
        // Include additional fields that might be useful
        attachment: comment.attachment,
        resolvable: comment.resolvable,
        resolved: comment.resolved,
        resolved_by: comment.resolved_by,
        resolved_at: comment.resolved_at,
        discussion_id: comment.discussion_id,
        position: comment.position
      };
    });
    
    return comments;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Comment schema validation error:', JSON.stringify(error.errors, null, 2));
    }
    throw error;
  }
}

async function getEpicComments(
  groupId: string,
  epicIid: number
): Promise<GitLabComment[]> {
  try {
    const url = `${GITLAB_API_URL}/groups/${encodeURIComponent(groupId)}/epics/${epicIid}/notes`;
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.statusText}`);
    }

    const responseData = await response.json() as unknown[];
    
    // Process response data to ensure comment text is included
    const comments = (responseData as any[]).map(comment => {
      // Determine the actual comment content from available fields
      const content = comment.body || comment.note || '';
      
      return {
        id: comment.id,
        // Only include content field to avoid duplication
        content,
        author: comment.author,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        system: comment.system,
        noteable_id: comment.noteable_id,
        noteable_type: comment.noteable_type,
        web_url: comment.web_url
      };
    });
    
    return comments;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Epic comment schema validation error:', JSON.stringify(error.errors, null, 2));
    }
    throw error;
  }
}

async function getIssueDetails(
  projectId: string,
  issueIid: number
): Promise<GitLabIssueDetails> {
  try {
    // First, get the issue details
    const url = `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/issues/${issueIid}`;
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.statusText}`);
    }

    const responseData = await response.json() as Record<string, unknown>;
    
    const issue = GitLabIssueSchema.parse(responseData);
    
    // Then, get comments
    try {
      const comments = await getIssueComments(projectId, issueIid);
      return { ...issue, comments };
    } catch (error) {
      // Return issue without comments if we can't fetch them
      console.error(`Error fetching issue comments: ${error}`);
      return issue;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Schema validation error:', JSON.stringify(error.errors, null, 2));
      throw new Error(`Issue schema validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    }
    throw error;
  }
}

async function getMergeRequestDetails(
  projectId: string,
  mergeRequestIid: number
): Promise<GitLabMergeRequestDetails> {
  try {
    // First, get the merge request details
    const url = `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/merge_requests/${mergeRequestIid}`;
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.statusText}`);
    }

    const responseData = await response.json() as Record<string, unknown>;
    
    const mergeRequest = GitLabMergeRequestSchema.parse(responseData);
    
    // Then, get comments
    try {
      const comments = await getMergeRequestComments(projectId, mergeRequestIid);
      return { ...mergeRequest, comments };
    } catch (error) {
      // Return MR without comments if we can't fetch them
      console.error(`Error fetching merge request comments: ${error}`);
      return mergeRequest;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Schema validation error:', JSON.stringify(error.errors, null, 2));
      throw new Error(`Merge request schema validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    }
    throw error;
  }
}

async function getUserActivity(
  userId: string,
  page: number = 1,
  perPage: number = 20
): Promise<GitLabUserActivity> {
  try {
    // First, determine if userId is a numeric ID or a username
    let userIdOrUsername = userId;
    if (!isNaN(Number(userId))) {
      // It's a numeric ID, use it directly
      userIdOrUsername = userId;
    } else {
      // It's a username, need to get the user ID first
      const userResponse = await fetch(`${GITLAB_API_URL}/users?username=${encodeURIComponent(userId)}`, {
        headers: {
          "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`
        }
      });

      if (!userResponse.ok) {
        throw new Error(`GitLab API error: ${userResponse.statusText}`);
      }

      const users = await userResponse.json() as any[];
      if (users.length === 0) {
        throw new Error(`User not found: ${userId}`);
      }

      userIdOrUsername = users[0].id.toString();
    }

    // Fetch user events
    const url = `${GITLAB_API_URL}/users/${userIdOrUsername}/events?page=${page}&per_page=${perPage}`;
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.statusText}`);
    }

    const responseData = await response.json() as unknown[];
    
    // Process response data with minimal validation
    // Skip schema validation which is causing issues
    // Return only the needed properties in a format that matches our schema
    const events = responseData.map((rawEvent: any) => {
      return {
        id: rawEvent.id,
        action_name: rawEvent.action_name,
        author_id: rawEvent.author_id,
        created_at: rawEvent.created_at,
        // Only include non-null values for optional fields
        ...(rawEvent.project_id !== null && { project_id: rawEvent.project_id }),
        ...(rawEvent.target_id !== null && { target_id: rawEvent.target_id }),
        ...(rawEvent.target_type !== null && { target_type: rawEvent.target_type }),
        ...(rawEvent.target_title !== null && { target_title: rawEvent.target_title }),
        ...(rawEvent.author && { author: rawEvent.author }),
        ...(rawEvent.push_data && { push_data: rawEvent.push_data }),
        ...(rawEvent.note && { note: rawEvent.note })
      };
    });
    
    // Get basic user info
    const userInfoUrl = `${GITLAB_API_URL}/users/${userIdOrUsername}`;
    const userInfoResponse = await fetch(userInfoUrl, {
      headers: {
        "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`
      }
    });

    let user = undefined;
    if (userInfoResponse.ok) {
      const userInfoData = await userInfoResponse.json() as Record<string, unknown>;
      user = GitLabUserSchema.parse(userInfoData);
    }

    return { events, user };
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('User activity schema validation error:', JSON.stringify(error.errors, null, 2));
      throw new Error(`User activity schema validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    }
    throw error;
  }
}

async function getEpicDetails(
    groupId: string,
    epicIid: number
): Promise<GitLabEpicDetails> {
    try {
        // First, get the epic details
        const url = `${GITLAB_API_URL}/groups/${encodeURIComponent(groupId)}/epics/${epicIid}`;
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`
            }
        });

        if (!response.ok) {
            throw new Error(`GitLab API error: ${response.statusText}`);
        }

        const responseData = await response.json() as Record<string, unknown>;
        const epic = GitLabEpicSchema.parse(responseData);

        // Fetch child items (epics and issues)
        try {
            const childrenUrl = `${GITLAB_API_URL}/groups/${encodeURIComponent(groupId)}/epics/${epicIid}/issues`;
            const childrenResponse = await fetch(childrenUrl, {
                headers: {
                    "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`
                }
            });

            if (childrenResponse.ok) {
                const childIssues = await childrenResponse.json() as any[];

                // Also fetch child epics
                const childEpicsUrl = `${GITLAB_API_URL}/groups/${encodeURIComponent(groupId)}/epics/${epicIid}/epics`;
                const childEpicsResponse = await fetch(childEpicsUrl, {
                    headers: {
                        "Authorization": `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`
                    }
                });

                let childEpics = [];
                if (childEpicsResponse.ok) {
                    childEpics = await childEpicsResponse.json() as any[];
                }

                // Format child items
                const children = [
                    ...childIssues.map(issue => ({
                        id: issue.id,
                        iid: issue.iid,
                        title: issue.title,
                        state: issue.state,
                        web_url: issue.web_url,
                        type: 'issue'
                    })),
                    ...childEpics.map(childEpic => ({
                        id: childEpic.id,
                        iid: childEpic.iid,
                        title: childEpic.title,
                        state: childEpic.state,
                        web_url: childEpic.web_url,
                        type: 'epic'
                    }))
                ];

                epic.children = children;
            }
        } catch (error) {
            console.error(`Error fetching epic children: ${error}`);
            // Continue without children if there's an error
        }

        // Then, get comments
        try {
            const comments = await getEpicComments(groupId, epicIid);
            return { ...epic, comments };
        } catch (error) {
            // Return epic without comments if we can't fetch them
            console.error(`Error fetching epic comments: ${error}`);
            return epic;
        }
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('Schema validation error:', JSON.stringify(error.errors, null, 2));
            throw new Error(`Epic schema validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
        }
        throw error;
    }
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
        name: "get_issue_details",
        description: "Get detailed information about an issue, including comments",
        inputSchema: zodToJsonSchema(GetIssueDetailsSchema)
      },
      {
        name: "get_merge_request_details",
        description: "Get detailed information about a merge request, including comments",
        inputSchema: zodToJsonSchema(GetMergeRequestDetailsSchema)
      },
      {
        name: "get_epic_details",
        description: "Get detailed information about an epic, including comments",
        inputSchema: zodToJsonSchema(GetEpicDetailsSchema)
      },
      {
        name: "get_user_activity",
        description: "Get user activity events for a specific user",
        inputSchema: zodToJsonSchema(GetUserActivitySchema)
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
          ref = await getDefaultBranchRef(args.project_id);
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

      case "get_issue_details": {
        const args = GetIssueDetailsSchema.parse(request.params.arguments);
        const issueDetails = await getIssueDetails(args.project_id, args.issue_iid);
        return { content: [{ type: "text", text: JSON.stringify(issueDetails, null, 2) }] };
      }

      case "get_merge_request_details": {
        const args = GetMergeRequestDetailsSchema.parse(request.params.arguments);
        const mrDetails = await getMergeRequestDetails(args.project_id, args.merge_request_iid);
        return { content: [{ type: "text", text: JSON.stringify(mrDetails, null, 2) }] };
      }

      case "get_epic_details": {
        const args = GetEpicDetailsSchema.parse(request.params.arguments);
        const epicDetails = await getEpicDetails(args.group_id, args.epic_iid);
        return { content: [{ type: "text", text: JSON.stringify(epicDetails, null, 2) }] };
      }

      case "get_user_activity": {
        const args = GetUserActivitySchema.parse(request.params.arguments);
        const userActivity = await getUserActivity(args.user_id, args.page, args.per_page);
        return { content: [{ type: "text", text: JSON.stringify(userActivity, null, 2) }] };
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