import { z } from "zod";
import { githubRequest } from "../common/utils.js";
import {
  GitHubPullRequestSchema,
  GitHubIssueAssigneeSchema,
  GitHubRepositorySchema,
} from "../common/types.js";

/**
 * GitHub API operations related to Pull Requests
 * 
 * PERMISSION REQUIREMENTS:
 * 
 * To use these functions, the GitHub Personal Access Token (PAT) must have the following permissions:
 * 
 * - For Fine-grained tokens:
 *   - `pull_requests: write` - For creating, editing, commenting, and merging PRs
 *   - `contents: write` - For operations involving repository content
 * 
 * - For classic tokens:
 *   - `repo` - Full access to repositories, including pull requests
 * 
 * NOTES:
 * 
 * - Most operations will only work on repositories where the token user has write permissions
 * - Line-specific comment operations (add_pull_request_comment) require additional parameters like diff_hunk
 * - Reply and conversation resolution operations require valid existing comment IDs
 */

// Schema definitions
export const PullRequestFileSchema = z.object({
  sha: z.string(),
  filename: z.string(),
  status: z.enum(['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged']),
  additions: z.number(),
  deletions: z.number(),
  changes: z.number(),
  blob_url: z.string(),
  raw_url: z.string(),
  contents_url: z.string(),
  patch: z.string().optional()
});

export const StatusCheckSchema = z.object({
  url: z.string(),
  state: z.enum(['error', 'failure', 'pending', 'success']),
  description: z.string().nullable(),
  target_url: z.string().nullable(),
  context: z.string(),
  created_at: z.string(),
  updated_at: z.string()
});

export const CombinedStatusSchema = z.object({
  state: z.enum(['error', 'failure', 'pending', 'success']),
  statuses: z.array(StatusCheckSchema),
  sha: z.string(),
  total_count: z.number()
});

export const PullRequestCommentSchema = z.object({
  url: z.string(),
  id: z.number(),
  node_id: z.string(),
  pull_request_review_id: z.number().nullable(),
  diff_hunk: z.string(),
  path: z.string().nullable(),
  position: z.number().nullable(),
  original_position: z.number().nullable(),
  commit_id: z.string(),
  original_commit_id: z.string(),
  user: GitHubIssueAssigneeSchema,
  body: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  html_url: z.string(),
  pull_request_url: z.string(),
  author_association: z.string(),
  _links: z.object({
    self: z.object({ href: z.string() }),
    html: z.object({ href: z.string() }),
    pull_request: z.object({ href: z.string() })
  })
});

export const PullRequestReviewSchema = z.object({
  id: z.number(),
  node_id: z.string(),
  user: GitHubIssueAssigneeSchema,
  body: z.string().nullable(),
  state: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING']),
  html_url: z.string(),
  pull_request_url: z.string(),
  commit_id: z.string(),
  submitted_at: z.string().nullable(),
  author_association: z.string()
});

// Input schemas
export const CreatePullRequestSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  title: z.string().describe("Pull request title"),
  body: z.string().optional().describe("Pull request body/description"),
  head: z.string().describe("The name of the branch where your changes are implemented"),
  base: z.string().describe("The name of the branch you want the changes pulled into"),
  draft: z.boolean().optional().describe("Whether to create the pull request as a draft"),
  maintainer_can_modify: z.boolean().optional().describe("Whether maintainers can modify the pull request")
});

export const GetPullRequestSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number")
});

export const ListPullRequestsSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  state: z.enum(['open', 'closed', 'all']).optional().describe("State of the pull requests to return"),
  head: z.string().optional().describe("Filter by head user or head organization and branch name"),
  base: z.string().optional().describe("Filter by base branch name"),
  sort: z.enum(['created', 'updated', 'popularity', 'long-running']).optional().describe("What to sort results by"),
  direction: z.enum(['asc', 'desc']).optional().describe("The direction of the sort"),
  per_page: z.number().optional().describe("Results per page (max 100)"),
  page: z.number().optional().describe("Page number of the results")
});

export const CreatePullRequestReviewSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number"),
  commit_id: z.string().optional().describe("The SHA of the commit that needs a review"),
  body: z.string().describe("The body text of the review"),
  event: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']).describe("The review action to perform"),
  comments: z.array(z.object({
    path: z.string().describe("The relative path to the file being commented on"),
    position: z.number().describe("The position in the diff where you want to add a review comment"),
    body: z.string().describe("Text of the review comment")
  })).optional().describe("Comments to post as part of the review")
});

export const MergePullRequestSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number"),
  commit_title: z.string().optional().describe("Title for the automatic commit message"),
  commit_message: z.string().optional().describe("Extra detail to append to automatic commit message"),
  merge_method: z.enum(['merge', 'squash', 'rebase']).optional().describe("Merge method to use")
});

export const GetPullRequestFilesSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"), 
  pull_number: z.number().describe("Pull request number")
});

export const GetPullRequestStatusSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number")
});

export const UpdatePullRequestBranchSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number"),
  expected_head_sha: z.string().optional().describe("The expected SHA of the pull request's HEAD ref")
});

export const GetPullRequestCommentsSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number")
});

export const GetPullRequestReviewsSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number")
});

export const AddPullRequestIssueCommentSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number"),
  body: z.string().describe("The text of the comment")
});

export const ResolvePullRequestConversationSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  comment_id: z.number().describe("The ID of the comment thread to resolve"),
  thread_id: z.string().describe("The ID of the thread to resolve")
});

// Novas schemas adicionadas
export const AddPullRequestCommentSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number"),
  body: z.string().describe("The text of the comment"),
  commit_id: z.string().describe("The SHA of the commit to comment on"),
  path: z.string().describe("The relative path to the file that you want to comment on"),
  position: z.number().describe("The position in the diff where you want to add a comment"),
  diff_hunk: z.string().optional().describe("The diff hunk of the file where the comment should be placed")
});

export const UpdatePullRequestSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  pull_number: z.number().describe("Pull request number"),
  title: z.string().optional().describe("The title of the pull request"),
  body: z.string().optional().describe("The contents of the pull request"),
  state: z.enum(['open', 'closed']).optional().describe("State of the pull request"),
  base: z.string().optional().describe("The name of the branch you want the changes pulled into"),
  maintainer_can_modify: z.boolean().optional().describe("Whether maintainers can modify the pull request")
});

export const ReplyToPullRequestCommentSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  comment_id: z.number().describe("The ID of the comment to reply to"),
  body: z.string().describe("The text of the reply")
});

export const UpdatePullRequestCommentSchema = z.object({
  owner: z.string().describe("Repository owner (username or organization)"),
  repo: z.string().describe("Repository name"),
  comment_id: z.number().describe("The ID of the comment to update"),
  body: z.string().describe("The new text of the comment")
});

// Function implementations
export async function createPullRequest(
  params: z.infer<typeof CreatePullRequestSchema>
): Promise<z.infer<typeof GitHubPullRequestSchema>> {
  try {
    const { owner, repo, ...options } = CreatePullRequestSchema.parse(params);

    const response = await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        method: "POST",
        body: options,
      }
    );

    return GitHubPullRequestSchema.parse(response);
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`Repository not found: Verify that the repository ${params.owner}/${params.repo} exists.`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Permission denied: The token doesn't have sufficient permissions to create pull requests in this repository.`);
    }
    if (error.response?.status === 422) {
      throw new Error(`Failed to create pull request: Make sure the branch names are correct and the pull request doesn't already exist.`);
    }
    if (error.message) {
      throw error;
    }
    throw new Error(`Error creating pull request: ${JSON.stringify(error)}`);
  }
}

export async function getPullRequest(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<z.infer<typeof GitHubPullRequestSchema>> {
  try {
    const response = await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`
    );
    return GitHubPullRequestSchema.parse(response);
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`Pull request not found: Verify that the pull request number (${pullNumber}) is correct.`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Permission denied: The token doesn't have sufficient permissions to access this pull request.`);
    }
    if (error.message) {
      throw error;
    }
    throw new Error(`Error retrieving pull request: ${JSON.stringify(error)}`);
  }
}

export async function listPullRequests(
  owner: string,
  repo: string,
  options: Omit<z.infer<typeof ListPullRequestsSchema>, 'owner' | 'repo'>
): Promise<z.infer<typeof GitHubPullRequestSchema>[]> {
  try {
    const url = new URL(`https://api.github.com/repos/${owner}/${repo}/pulls`);
    
    if (options.state) url.searchParams.append('state', options.state);
    if (options.head) url.searchParams.append('head', options.head);
    if (options.base) url.searchParams.append('base', options.base);
    if (options.sort) url.searchParams.append('sort', options.sort);
    if (options.direction) url.searchParams.append('direction', options.direction);
    if (options.per_page) url.searchParams.append('per_page', options.per_page.toString());
    if (options.page) url.searchParams.append('page', options.page.toString());

    const response = await githubRequest(url.toString());
    return z.array(GitHubPullRequestSchema).parse(response);
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`Repository not found: Verify that the repository ${owner}/${repo} exists.`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Permission denied: The token doesn't have sufficient permissions to list pull requests in this repository.`);
    }
    if (error.message) {
      throw error;
    }
    throw new Error(`Error listing pull requests: ${JSON.stringify(error)}`);
  }
}

/**
 * Helper function to extract the diff_hunk based on position
 * @param patch The PR file patch
 * @param position The position in the diff where to add the comment
 * @returns The diff_hunk corresponding to the position
 */
function extractDiffHunkForPosition(patch: string, position: number): string {
  const lines = patch.split('\n');
  
  // A typical diff_hunk contains a few lines of context
  // Let's take a few lines before and after the specified position
  const contextSize = 3;
  const startLine = Math.max(0, position - contextSize);
  const endLine = Math.min(lines.length, position + contextSize);
  
  // Extract the relevant lines
  const hunkLines = lines.slice(startLine, endLine);
  
  // If we don't find a hunk header, let's add one
  if (!hunkLines.some(line => line.startsWith('@@'))) {
    // Determine line numbers for the header
    let oldStart = 0;
    let newStart = 0;
    
    // Count lines with - and + up to the position to estimate line numbers
    for (let i = 0; i < Math.min(position, lines.length); i++) {
      const line = lines[i];
      if (line.startsWith('-')) oldStart++;
      else if (line.startsWith('+')) newStart++;
      else if (!line.startsWith('@@')) {
        oldStart++;
        newStart++;
      }
    }
    
    const header = `@@ -${oldStart},${contextSize} +${newStart},${contextSize} @@`;
    hunkLines.unshift(header);
  }
  
  return hunkLines.join('\n');
}

/**
 * Create a pull request review with enhanced support for line comments
 */
export async function createPullRequestReview(
  owner: string,
  repo: string,
  pullNumber: number,
  options: Omit<z.infer<typeof CreatePullRequestReviewSchema>, 'owner' | 'repo' | 'pull_number'>
): Promise<z.infer<typeof PullRequestReviewSchema>> {
  try {
    // If there are comments, we need to enrich each one with its corresponding diff_hunk
    if (options.comments && options.comments.length > 0) {
      const files = await getPullRequestFiles(owner, repo, pullNumber);
      
      // Enrich each comment with the corresponding diff_hunk
      const enrichedComments = await Promise.all(options.comments.map(async (comment) => {
        const file = files.find(f => f.filename === comment.path);
        
        if (!file || !file.patch) {
          throw new Error(`File ${comment.path} not found in pull request or has no patch`);
        }
        
        const diffHunk = extractDiffHunkForPosition(file.patch, comment.position);
        
        return {
          ...comment,
          diff_hunk: diffHunk
        };
      }));
      
      options = {
        ...options,
        comments: enrichedComments as any
      };
    }
    
    const response = await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`,
      {
        method: 'POST',
        body: options,
      }
    );
    return PullRequestReviewSchema.parse(response);
  } catch (error: any) {
    if (error.response?.status === 422) {
      throw new Error(`Failed to create review: Make sure the token has proper permissions and that the positions in the comments are valid in the diff.`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Permission denied: The token doesn't have sufficient permissions to create reviews on this pull request.`);
    }
    if (error.message) {
      throw error;
    }
    throw new Error(`Error creating pull request review: ${JSON.stringify(error)}`);
  }
}

export async function mergePullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  options: Omit<z.infer<typeof MergePullRequestSchema>, 'owner' | 'repo' | 'pull_number'>
): Promise<any> {
  try {
    return await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
      {
        method: 'PUT',
        body: options,
      }
    );
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`Pull request not found: Verify that the pull request number (${pullNumber}) is correct.`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Permission denied: The token doesn't have sufficient permissions to merge this pull request.`);
    }
    if (error.response?.status === 405) {
      throw new Error(`Pull request cannot be merged: The pull request is not in a mergeable state (might have conflicts or failed checks).`);
    }
    if (error.response?.status === 409) {
      throw new Error(`Merge conflict: The pull request has conflicts that must be resolved before merging.`);
    }
    if (error.response?.status === 422) {
      throw new Error(`Failed to merge pull request: Make sure the token has proper permissions (pull_requests:write) and the branch can be merged.`);
    }
    if (error.message) {
      throw error;
    }
    throw new Error(`Error merging pull request: ${JSON.stringify(error)}`);
  }
}

export async function getPullRequestFiles(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<z.infer<typeof PullRequestFileSchema>[]> {
  try {
    const response = await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files`
    );
    return z.array(PullRequestFileSchema).parse(response);
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`Pull request not found: Verify that the pull request number (${pullNumber}) is correct.`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Permission denied: The token doesn't have sufficient permissions to access the files of this pull request.`);
    }
    if (error.message) {
      throw error;
    }
    throw new Error(`Error retrieving pull request files: ${JSON.stringify(error)}`);
  }
}

export async function updatePullRequestBranch(
  owner: string,
  repo: string,
  pullNumber: number,
  expectedHeadSha?: string
): Promise<void> {
  try {
    await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/update-branch`,
      {
        method: "PUT",
        body: expectedHeadSha ? { expected_head_sha: expectedHeadSha } : undefined,
      }
    );
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`Pull request not found: Verify that the pull request number (${pullNumber}) is correct.`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Permission denied: The token doesn't have sufficient permissions to update the branch of this pull request.`);
    }
    if (error.response?.status === 422) {
      if (expectedHeadSha) {
        throw new Error(`Expected head SHA mismatch: The current head SHA of the branch doesn't match the expected SHA.`);
      }
      throw new Error(`Failed to update pull request branch: Make sure the token has proper permissions (pull_requests:write).`);
    }
    if (error.message) {
      throw error;
    }
    throw new Error(`Error updating pull request branch: ${JSON.stringify(error)}`);
  }
}

export async function getPullRequestComments(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<z.infer<typeof PullRequestCommentSchema>[]> {
  try {
    const response = await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/comments`
    );
    return z.array(PullRequestCommentSchema).parse(response);
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`Pull request not found: Verify that the pull request number (${pullNumber}) is correct.`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Permission denied: The token doesn't have sufficient permissions to access the comments of this pull request.`);
    }
    if (error.message) {
      throw error;
    }
    throw new Error(`Error retrieving pull request comments: ${JSON.stringify(error)}`);
  }
}

export async function getPullRequestReviews(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<z.infer<typeof PullRequestReviewSchema>[]> {
  try {
    const response = await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`
    );
    return z.array(PullRequestReviewSchema).parse(response);
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`Pull request not found: Verify that the pull request number (${pullNumber}) is correct.`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Permission denied: The token doesn't have sufficient permissions to access the reviews of this pull request.`);
    }
    if (error.message) {
      throw error;
    }
    throw new Error(`Error retrieving pull request reviews: ${JSON.stringify(error)}`);
  }
}

export async function getPullRequestStatus(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<z.infer<typeof CombinedStatusSchema>> {
  try {
    // First get the PR to get the head SHA
    const pr = await getPullRequest(owner, repo, pullNumber);
    const sha = pr.head.sha;

    // Then get the combined status for that SHA
    const response = await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/status`
    );
    return CombinedStatusSchema.parse(response);
  } catch (error: any) {
    if (error.message && error.message.includes('Pull request not found')) {
      // Re-throw the error from getPullRequest
      throw error;
    }
    if (error.response?.status === 404) {
      throw new Error(`Status not found: The pull request exists, but its status information is not available.`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Permission denied: The token doesn't have sufficient permissions to access the status of this pull request.`);
    }
    if (error.message) {
      throw error;
    }
    throw new Error(`Error retrieving pull request status: ${JSON.stringify(error)}`);
  }
}

export async function addPullRequestIssueComment(
  owner: string,
  repo: string,
  pullNumber: number,
  body: string
): Promise<any> {
  // Pull requests are also issues, so we use the issues comment API
  try {
    const response = await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/issues/${pullNumber}/comments`,
      {
        method: "POST",
        body: { body }
      }
    );
    return response;
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`Pull request not found: Verify that the pull request number (${pullNumber}) is correct.`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Permission denied: The token doesn't have sufficient permissions to comment on this pull request.`);
    }
    if (error.response?.status === 422) {
      throw new Error(`Failed to add comment: Make sure the token has proper permissions (pull_requests:write).`);
    }
    if (error.message) {
      throw error;
    }
    throw new Error(`Error adding comment to pull request: ${JSON.stringify(error)}`);
  }
}

export async function resolvePullRequestConversation(
  owner: string,
  repo: string,
  commentId: number,
  threadId: string
): Promise<void> {
  try {
    await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls/comments/${commentId}/threads/${threadId}/resolve`,
      {
        method: "PUT",
        body: {}
      }
    );
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`Conversation not found: Verify that the comment ID (${commentId}) and thread ID (${threadId}) are correct.`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Permission denied: The token doesn't have sufficient permissions to resolve conversations on this pull request.`);
    }
    if (error.response?.status === 422) {
      throw new Error(`Failed to resolve conversation: Make sure the token has proper permissions (pull_requests:write).`);
    }
    if (error.message) {
      throw error;
    }
    throw new Error(`Error resolving pull request conversation: ${JSON.stringify(error)}`);
  }
}

/**
 * Add a comment to a specific line in a pull request
 */
export async function addPullRequestComment(
  owner: string,
  repo: string,
  pullNumber: number,
  body: string,
  commitId: string,
  path: string,
  position: number
): Promise<z.infer<typeof PullRequestCommentSchema>> {
  try {
    // Get the diff_hunk first
    const files = await getPullRequestFiles(owner, repo, pullNumber);
    const file = files.find(f => f.filename === path);
    
    if (!file || !file.patch) {
      throw new Error(`File ${path} not found in pull request or has no patch`);
    }
    
    // Extract the appropriate diff_hunk based on position
    const diffHunk = extractDiffHunkForPosition(file.patch, position);
    
    const response = await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/comments`,
      {
        method: "POST",
        body: {
          body,
          commit_id: commitId,
          path,
          position,
          diff_hunk: diffHunk
        }
      }
    );
    
    return PullRequestCommentSchema.parse(response);
  } catch (error: any) {
    // Improved error handling
    if (error.response?.status === 422) {
      throw new Error(`Failed to add comment: Make sure the token has proper permissions (pull_requests:write and contents:write) and that the position is valid in the diff.`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Permission denied: The token doesn't have sufficient permissions to comment on this pull request.`);
    }
    if (error.message) {
      throw error;
    }
    throw new Error(`Error adding comment to pull request: ${JSON.stringify(error)}`);
  }
}

/**
 * Update an existing pull request (title, body, state, etc.)
 */
export async function updatePullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  options: Omit<z.infer<typeof UpdatePullRequestSchema>, 'owner' | 'repo' | 'pull_number'>
): Promise<z.infer<typeof GitHubPullRequestSchema>> {
  try {
    const response = await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
      {
        method: "PATCH",
        body: options
      }
    );
    
    return GitHubPullRequestSchema.parse(response);
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`Pull request not found: Verify that the pull request number (${pullNumber}) is correct.`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Permission denied: The token doesn't have sufficient permissions to update this pull request.`);
    }
    if (error.response?.status === 422) {
      throw new Error(`Failed to update pull request: Make sure the token has proper permissions (pull_requests:write).`);
    }
    if (error.message) {
      throw error;
    }
    throw new Error(`Error updating pull request: ${JSON.stringify(error)}`);
  }
}

/**
 * Reply to an existing pull request comment
 */
export async function replyToPullRequestComment(
  owner: string,
  repo: string,
  commentId: number,
  body: string
): Promise<z.infer<typeof PullRequestCommentSchema>> {
  try {
    const response = await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls/comments/${commentId}/replies`,
      {
        method: "POST",
        body: { body }
      }
    );
    
    return PullRequestCommentSchema.parse(response);
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`Comment not found: Verify that the comment ID (${commentId}) is correct.`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Permission denied: The token doesn't have sufficient permissions to reply to comments on this pull request.`);
    }
    if (error.response?.status === 422) {
      throw new Error(`Failed to reply to comment: Make sure the token has proper permissions (pull_requests:write).`);
    }
    if (error.message) {
      throw error;
    }
    throw new Error(`Error replying to pull request comment: ${JSON.stringify(error)}`);
  }
}

/**
 * Update an existing pull request comment
 */
export async function updatePullRequestComment(
  owner: string,
  repo: string,
  commentId: number,
  body: string
): Promise<z.infer<typeof PullRequestCommentSchema>> {
  try {
    const response = await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/pulls/comments/${commentId}`,
      {
        method: "PATCH",
        body: { body }
      }
    );
    
    return PullRequestCommentSchema.parse(response);
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`Comment not found: Verify that the comment ID (${commentId}) is correct.`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Permission denied: The token doesn't have sufficient permissions to update comments on this pull request.`);
    }
    if (error.response?.status === 422) {
      throw new Error(`Failed to update comment: Make sure the token has proper permissions (pull_requests:write).`);
    }
    if (error.message) {
      throw error;
    }
    throw new Error(`Error updating pull request comment: ${JSON.stringify(error)}`);
  }
}