#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import * as repository from './operations/repository.js';
import * as files from './operations/files.js';
import * as issues from './operations/issues.js';
import * as pulls from './operations/pulls.js';
import * as branches from './operations/branches.js';
import * as search from './operations/search.js';
import * as commits from './operations/commits.js';
import * as actions from './operations/actions.js';
import {
  GitHubError,
  GitHubValidationError,
  GitHubResourceNotFoundError,
  GitHubAuthenticationError,
  GitHubPermissionError,
  GitHubRateLimitError,
  GitHubConflictError,
  isGitHubError,
} from './common/errors.js';
import { VERSION } from "./common/version.js";

const server = new Server(
  {
    name: "github-mcp-server",
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

function formatGitHubError(error: GitHubError): string {
  let message = `GitHub API Error: ${error.message}`;
  
  if (error instanceof GitHubValidationError) {
    message = `Validation Error: ${error.message}`;
    if (error.response) {
      message += `\nDetails: ${JSON.stringify(error.response)}`;
    }
  } else if (error instanceof GitHubResourceNotFoundError) {
    message = `Not Found: ${error.message}`;
  } else if (error instanceof GitHubAuthenticationError) {
    message = `Authentication Failed: ${error.message}`;
  } else if (error instanceof GitHubPermissionError) {
    message = `Permission Denied: ${error.message}`;
  } else if (error instanceof GitHubRateLimitError) {
    message = `Rate Limit Exceeded: ${error.message}\nResets at: ${error.resetAt.toISOString()}`;
  } else if (error instanceof GitHubConflictError) {
    message = `Conflict: ${error.message}`;
  }

  return message;
}

// Register all tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Original tools
      {
        name: "create_or_update_file",
        description: "Create or update a single file in a GitHub repository",
        inputSchema: zodToJsonSchema(files.CreateOrUpdateFileSchema),
      },
      {
        name: "search_repositories",
        description: "Search for GitHub repositories",
        inputSchema: zodToJsonSchema(repository.SearchRepositoriesSchema),
      },
      {
        name: "create_repository",
        description: "Create a new GitHub repository in your account",
        inputSchema: zodToJsonSchema(repository.CreateRepositoryOptionsSchema),
      },
      {
        name: "get_file_contents",
        description: "Get the contents of a file or directory from a GitHub repository",
        inputSchema: zodToJsonSchema(files.GetFileContentsSchema),
      },
      {
        name: "push_files",
        description: "Push multiple files to a GitHub repository in a single commit",
        inputSchema: zodToJsonSchema(files.PushFilesSchema),
      },
      {
        name: "create_issue",
        description: "Create a new issue in a GitHub repository",
        inputSchema: zodToJsonSchema(issues.CreateIssueSchema),
      },
      {
        name: "create_pull_request",
        description: "Create a new pull request in a GitHub repository",
        inputSchema: zodToJsonSchema(pulls.CreatePullRequestSchema),
      },
      {
        name: "fork_repository",
        description: "Fork a GitHub repository to your account or specified organization",
        inputSchema: zodToJsonSchema(repository.ForkRepositorySchema),
      },
      {
        name: "create_branch",
        description: "Create a new branch in a GitHub repository",
        inputSchema: zodToJsonSchema(branches.CreateBranchSchema),
      },
      {
        name: "list_commits",
        description: "Get list of commits of a branch in a GitHub repository",
        inputSchema: zodToJsonSchema(commits.ListCommitsSchema)
      },
      {
        name: "list_issues",
        description: "List issues in a GitHub repository with filtering options",
        inputSchema: zodToJsonSchema(issues.ListIssuesOptionsSchema)
      },
      {
        name: "update_issue",
        description: "Update an existing issue in a GitHub repository",
        inputSchema: zodToJsonSchema(issues.UpdateIssueOptionsSchema)
      },
      {
        name: "add_issue_comment",
        description: "Add a comment to an existing issue",
        inputSchema: zodToJsonSchema(issues.IssueCommentSchema)
      },
      {
        name: "search_code",
        description: "Search for code across GitHub repositories",
        inputSchema: zodToJsonSchema(search.SearchCodeSchema),
      },
      {
        name: "search_issues",
        description: "Search for issues and pull requests across GitHub repositories",
        inputSchema: zodToJsonSchema(search.SearchIssuesSchema),
      },
      {
        name: "search_users",
        description: "Search for users on GitHub",
        inputSchema: zodToJsonSchema(search.SearchUsersSchema),
      },
      {
        name: "get_issue",
        description: "Get details of a specific issue in a GitHub repository.",
        inputSchema: zodToJsonSchema(issues.GetIssueSchema)
      },
      
      // GitHub Actions tools
      {
        name: "list_workflows",
        description: "List GitHub Actions workflows in a repository",
        inputSchema: zodToJsonSchema(z.object({
          owner: z.string().describe("Repository owner (username or organization)"),
          repo: z.string().describe("Repository name"),
          page: z.number().optional().describe("Page number for pagination"),
          per_page: z.number().optional().describe("Results per page (max 100)")
        }))
      },
      {
        name: "get_workflow",
        description: "Get a specific GitHub Actions workflow",
        inputSchema: zodToJsonSchema(z.object({
          owner: z.string().describe("Repository owner (username or organization)"),
          repo: z.string().describe("Repository name"),
          workflow_id: z.union([z.string(), z.number()]).describe("Workflow ID or filename")
        }))
      },
      
      // Workflow run tools
      {
        name: "list_workflow_runs",
        description: "List GitHub Actions workflow runs",
        inputSchema: zodToJsonSchema(z.object({
          owner: z.string().describe("Repository owner (username or organization)"),
          repo: z.string().describe("Repository name"),
          workflow_id: z.union([z.string(), z.number()]).optional().describe("Workflow ID or filename"),
          actor: z.string().optional().describe("Filter by user who triggered the workflow"),
          branch: z.string().optional().describe("Filter by branch"),
          event: z.string().optional().describe("Filter by event type (push, pull_request, etc.)"),
          status: z.enum(['completed', 'action_required', 'cancelled', 'failure', 'neutral', 'skipped', 'stale', 'success', 'timed_out', 'in_progress', 'queued', 'requested', 'waiting', 'pending']).optional().describe("Filter by status"),
          per_page: z.number().optional().describe("Results per page (max 100)"),
          page: z.number().optional().describe("Page number")
        }))
      },
      {
        name: "get_workflow_run",
        description: "Get a specific GitHub Actions workflow run",
        inputSchema: zodToJsonSchema(z.object({
          owner: z.string().describe("Repository owner (username or organization)"),
          repo: z.string().describe("Repository name"),
          run_id: z.number().describe("Run ID")
        }))
      },
      {
        name: "list_workflow_jobs",
        description: "List jobs for a workflow run",
        inputSchema: zodToJsonSchema(z.object({
          owner: z.string().describe("Repository owner (username or organization)"),
          repo: z.string().describe("Repository name"),
          run_id: z.number().describe("Run ID"),
          filter: z.enum(['latest', 'all']).optional().describe("Filter jobs by their completion status"),
          per_page: z.number().optional().describe("Results per page (max 100)"),
          page: z.number().optional().describe("Page number")
        }))
      },
      {
        name: "get_workflow_job",
        description: "Get a specific job from a workflow run",
        inputSchema: zodToJsonSchema(z.object({
          owner: z.string().describe("Repository owner (username or organization)"),
          repo: z.string().describe("Repository name"),
          job_id: z.number().describe("Job ID")
        }))
      },
      
      // Artifacts and logs
      {
        name: "list_workflow_run_artifacts",
        description: "List artifacts for a workflow run",
        inputSchema: zodToJsonSchema(z.object({
          owner: z.string().describe("Repository owner (username or organization)"),
          repo: z.string().describe("Repository name"),
          run_id: z.number().describe("Run ID"),
          per_page: z.number().optional().describe("Results per page (max 100)"),
          page: z.number().optional().describe("Page number")
        }))
      },
      {
        name: "download_workflow_run_logs",
        description: "Get download URL for workflow run logs",
        inputSchema: zodToJsonSchema(z.object({
          owner: z.string().describe("Repository owner (username or organization)"),
          repo: z.string().describe("Repository name"),
          run_id: z.number().describe("Run ID")
        }))
      },
      {
        name: "get_job_logs",
        description: "Get download URL for job logs",
        inputSchema: zodToJsonSchema(z.object({
          owner: z.string().describe("Repository owner (username or organization)"),
          repo: z.string().describe("Repository name"),
          job_id: z.number().describe("Job ID")
        }))
      },
      
      // Advanced helper tools
      {
        name: "get_recent_failed_runs",
        description: "Get details of recent failed workflow runs including the specific jobs and steps that failed",
        inputSchema: zodToJsonSchema(z.object({
          owner: z.string().describe("Repository owner (username or organization)"),
          repo: z.string().describe("Repository name"),
          limit: z.number().optional().describe("Maximum number of failed runs to return")
        }))
      }
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    const name = request.params.name;
    const args = request.params.arguments;

    // GitHub Actions tools
    if (name === "list_workflows") {
      const { owner, repo, page, per_page } = args as any;
      const result = await actions.listWorkflows(owner, repo, page, per_page);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
    
    if (name === "get_workflow") {
      const { owner, repo, workflow_id } = args as any;
      const result = await actions.getWorkflow(owner, repo, workflow_id);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
    
    if (name === "list_workflow_runs") {
      const { owner, repo, ...options } = args as any;
      const result = await actions.listWorkflowRuns(owner, repo, options);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
    
    if (name === "get_workflow_run") {
      const { owner, repo, run_id } = args as any;
      const result = await actions.getWorkflowRun(owner, repo, run_id);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
    
    if (name === "list_workflow_jobs") {
      const { owner, repo, run_id, filter, page, per_page } = args as any;
      const result = await actions.listWorkflowJobs(owner, repo, run_id, filter, page, per_page);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
    
    if (name === "get_workflow_job") {
      const { owner, repo, job_id } = args as any;
      const result = await actions.getWorkflowJob(owner, repo, job_id);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
    
    if (name === "list_workflow_run_artifacts") {
      const { owner, repo, run_id, page, per_page } = args as any;
      const result = await actions.listWorkflowRunArtifacts(owner, repo, run_id, page, per_page);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
    
    if (name === "download_workflow_run_logs") {
      const { owner, repo, run_id } = args as any;
      const result = await actions.downloadWorkflowRunLogs(owner, repo, run_id);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
    
    if (name === "get_job_logs") {
      const { owner, repo, job_id } = args as any;
      const result = await actions.getJobLogs(owner, repo, job_id);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
    
    if (name === "get_recent_failed_runs") {
      const { owner, repo, limit } = args as any;
      const result = await actions.getRecentFailedRuns(owner, repo, limit);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }

    // Original tool handlers
    switch (name) {
      case "fork_repository": {
        const parsedArgs = repository.ForkRepositorySchema.parse(args);
        const fork = await repository.forkRepository(parsedArgs.owner, parsedArgs.repo, parsedArgs.organization);
        return {
          content: [{ type: "text", text: JSON.stringify(fork, null, 2) }],
        };
      }

      case "create_branch": {
        const parsedArgs = branches.CreateBranchSchema.parse(args);
        const branch = await branches.createBranchFromRef(
          parsedArgs.owner,
          parsedArgs.repo,
          parsedArgs.branch,
          parsedArgs.from_branch
        );
        return {
          content: [{ type: "text", text: JSON.stringify(branch, null, 2) }],
        };
      }

      case "search_repositories": {
        const parsedArgs = repository.SearchRepositoriesSchema.parse(args);
        const results = await repository.searchRepositories(
          parsedArgs.query,
          parsedArgs.page,
          parsedArgs.perPage
        );
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      }

      case "create_repository": {
        const parsedArgs = repository.CreateRepositoryOptionsSchema.parse(args);
        const result = await repository.createRepository(parsedArgs);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_file_contents": {
        const parsedArgs = files.GetFileContentsSchema.parse(args);
        const contents = await files.getFileContents(
          parsedArgs.owner,
          parsedArgs.repo,
          parsedArgs.path,
          parsedArgs.branch
        );
        return {
          content: [{ type: "text", text: JSON.stringify(contents, null, 2) }],
        };
      }

      case "create_or_update_file": {
        const parsedArgs = files.CreateOrUpdateFileSchema.parse(args);
        const result = await files.createOrUpdateFile(
          parsedArgs.owner,
          parsedArgs.repo,
          parsedArgs.path,
          parsedArgs.content,
          parsedArgs.message,
          parsedArgs.branch,
          parsedArgs.sha
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "push_files": {
        const parsedArgs = files.PushFilesSchema.parse(args);
        const result = await files.pushFiles(
          parsedArgs.owner,
          parsedArgs.repo,
          parsedArgs.branch,
          parsedArgs.files,
          parsedArgs.message
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "create_issue": {
        const parsedArgs = issues.CreateIssueSchema.parse(args);
        const { owner, repo, ...options } = parsedArgs;
        const issue = await issues.createIssue(owner, repo, options);
        return {
          content: [{ type: "text", text: JSON.stringify(issue, null, 2) }],
        };
      }

      case "create_pull_request": {
        const parsedArgs = pulls.CreatePullRequestSchema.parse(args);
        const pullRequest = await pulls.createPullRequest(parsedArgs);
        return {
          content: [{ type: "text", text: JSON.stringify(pullRequest, null, 2) }],
        };
      }

      case "search_code": {
        const parsedArgs = search.SearchCodeSchema.parse(args);
        const results = await search.searchCode(parsedArgs);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      }

      case "search_issues": {
        const parsedArgs = search.SearchIssuesSchema.parse(args);
        const results = await search.searchIssues(parsedArgs);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      }

      case "search_users": {
        const parsedArgs = search.SearchUsersSchema.parse(args);
        const results = await search.searchUsers(parsedArgs);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      }

      case "list_issues": {
        const parsedArgs = issues.ListIssuesOptionsSchema.parse(args);
        const { owner, repo, ...options } = parsedArgs;
        const result = await issues.listIssues(owner, repo, options);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "update_issue": {
        const parsedArgs = issues.UpdateIssueOptionsSchema.parse(args);
        const { owner, repo, issue_number, ...options } = parsedArgs;
        const result = await issues.updateIssue(owner, repo, issue_number, options);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "add_issue_comment": {
        const parsedArgs = issues.IssueCommentSchema.parse(args);
        const { owner, repo, issue_number, body } = parsedArgs;
        const result = await issues.addIssueComment(owner, repo, issue_number, body);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "list_commits": {
        const parsedArgs = commits.ListCommitsSchema.parse(args);
        const results = await commits.listCommits(
          parsedArgs.owner,
          parsedArgs.repo,
          parsedArgs.page,
          parsedArgs.perPage,
          parsedArgs.sha
        );
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      }

      case "get_issue": {
        const parsedArgs = issues.GetIssueSchema.parse(args);
        const issue = await issues.getIssue(parsedArgs.owner, parsedArgs.repo, parsedArgs.issue_number);
        return {
          content: [{ type: "text", text: JSON.stringify(issue, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid input: ${JSON.stringify(error.errors)}`);
    }
    if (isGitHubError(error)) {
      throw new Error(formatGitHubError(error as GitHubError));
    }
    throw error;
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitHub MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});