import { z } from "zod";
import { githubRequest, buildUrl } from "../common/utils.js";

export const GetIssueSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
});

export const IssueCommentSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
  body: z.string(),
});

export const CreateIssueOptionsSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  assignees: z.array(z.string()).optional(),
  milestone: z.number().optional(),
  labels: z.array(z.string()).optional(),
  type: z.string().optional().describe("The name of the issue type to set"),
});

export const CreateIssueSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  ...CreateIssueOptionsSchema.shape,
});

export const ListIssuesOptionsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  direction: z.enum(["asc", "desc"]).optional(),
  labels: z.array(z.string()).optional(),
  page: z.number().optional(),
  per_page: z.number().optional(),
  since: z.string().optional(),
  sort: z.enum(["created", "updated", "comments"]).optional(),
  state: z.enum(["open", "closed", "all"]).optional(),
});

/**
 * UpdateIssueOptionsSchema:
 * - owner: The owner of the repository.
 * - repo: The name of the repository.
 * - issue_number: The number of the issue to update.
 * - title: (Optional) The new title for the issue.
 * - body: (Optional) The new body content for the issue.
 * - assignees: (Optional) An array of usernames to assign to the issue.
 * - milestone: (Optional) The milestone to associate with the issue.
 * - labels: (Optional) An array of labels to apply to the issue.
 * - state: (Optional) The state of the issue (open or closed).
 * - type: (Optional) The name of the issue type to set (e.g., Bug, Feature, Task).
 */
export const UpdateIssueOptionsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
  title: z.string().optional(),
  body: z.string().optional(),
  assignees: z.array(z.string()).optional(),
  milestone: z.number().optional(),
  labels: z.array(z.string()).optional(),
  state: z.enum(["open", "closed"]).optional(),
  type: z.string().optional().describe("The name of the issue type to set"),
});

export const AddSubIssuesSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number(),
  sub_issues: z.array(z.object({
    owner: z.string(),
    repo: z.string(),
    issue_number: z.number()
  })).describe("List of sub-issues to add")
});

export async function getIssue(owner: string, repo: string, issue_number: number) {
  return githubRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}`);
}

export async function addIssueComment(
  owner: string,
  repo: string,
  issue_number: number,
  body: string
) {
  return githubRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}/comments`, {
    method: "POST",
    body: { body },
  });
}

export async function createIssue(
  owner: string,
  repo: string,
  options: z.infer<typeof CreateIssueOptionsSchema>
) {
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/issues`,
    {
      method: "POST",
      body: options,
    }
  );
}

export async function listIssues(
  owner: string,
  repo: string,
  options: Omit<z.infer<typeof ListIssuesOptionsSchema>, "owner" | "repo">
) {
  const urlParams: Record<string, string | undefined> = {
    direction: options.direction,
    labels: options.labels?.join(","),
    page: options.page?.toString(),
    per_page: options.per_page?.toString(),
    since: options.since,
    sort: options.sort,
    state: options.state
  };

  return githubRequest(
    buildUrl(`https://api.github.com/repos/${owner}/${repo}/issues`, urlParams)
  );
}

export async function updateIssue(
  owner: string,
  repo: string,
  issue_number: number,
  options: Omit<z.infer<typeof UpdateIssueOptionsSchema>, "owner" | "repo" | "issue_number">
) {
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}`,
    {
      method: "PATCH",
      body: options,
    }
  );
}

export async function addSubIssues(
  owner: string,
  repo: string,
  issue_number: number,
  sub_issues: { owner: string; repo: string; issue_number: number }[]
) {
  const results = [];
  
  try {
    // Add each sub-issue individually using the official GitHub API
    for (const subIssue of sub_issues) {
      try {
        // Check if the sub-issue is in the same repository as the parent
        if (subIssue.owner !== owner || subIssue.repo !== repo) {
          throw new Error("Sub-issues must belong to the same repository as the parent issue");
        }
        
        // We need to get the issue ID from the issue number
        const issueDetails = await getIssue(subIssue.owner, subIssue.repo, subIssue.issue_number);
        const subIssueId = issueDetails.id; // Get the actual ID, not the number
        
        // According to GitHub API docs, we need to send sub_issue_id (the ID, not the number)
        const result = await githubRequest(
          `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}/sub_issues`,
          {
            method: "POST",
            body: {
              sub_issue_id: subIssueId
            },
            headers: {
              "X-GitHub-Api-Version": "2022-11-28"
            }
          }
        );
        
        results.push(result);
      } catch (error: any) {
        // Handle specific validation errors for sub-issues
        if (error.status === 422) {
          // Check for common validation errors
          if (error.message && error.message.includes("duplicate sub-issues")) {
            throw new Error(`Issue #${subIssue.issue_number} is already a sub-issue of issue #${issue_number}.`);
          } else if (error.message && error.message.includes("only have one parent")) {
            throw new Error(`Issue #${subIssue.issue_number} already has a different parent issue. An issue can only have one parent.`);
          } else {
            throw new Error(`Validation error when adding issue #${subIssue.issue_number} as sub-issue: ${error.message}`);
          }
        }
        throw error;
      }
    }
    
    return {
      parent_issue_number: issue_number,
      parent_repo: `${owner}/${repo}`,
      added_sub_issues: results
    };
  } catch (error: any) {
    // Handle not found errors specifically for sub-issues feature
    if (error.message && error.message.includes("Not Found")) {
      // Fall back to the task list approach
      return await addSubIssuesWithTaskList(owner, repo, issue_number, sub_issues);
    }
    
    // Re-throw specific errors we've already formatted
    if (error.message && (
      error.message.includes("already a sub-issue") || 
      error.message.includes("already has a different parent") ||
      error.message.includes("Validation error when adding issue")
    )) {
      throw error;
    }
    
    // Generic error handling
    throw error;
  }
}

// Fallback implementation using task lists when the API endpoint is not available
async function addSubIssuesWithTaskList(
  owner: string,
  repo: string,
  issue_number: number,
  sub_issues: { owner: string; repo: string; issue_number: number }[]
) {
  // First, get the current parent issue to access its body
  const parentIssue = await getIssue(owner, repo, issue_number);
  
  // Generate task list items for each sub-issue
  const subIssueTasks = sub_issues.map((subIssue) => {
    // Check if we're referencing an issue in the same repo or a different repo
    const isSameRepo = subIssue.owner === owner && subIssue.repo === repo;
    const issueRef = isSameRepo 
      ? `#${subIssue.issue_number}`
      : `${subIssue.owner}/${subIssue.repo}#${subIssue.issue_number}`;
    
    return `- [ ] ${issueRef}`;
  }).join('\n');

  // Determine the new body for parent issue
  let newParentBody = '';
  if (!parentIssue.body) {
    // If the issue has no body yet, create one with the task list
    newParentBody = `### Sub-issues\n\n${subIssueTasks}\n\n> Note: Using task list format because the GitHub sub-issues API feature is not available for this repository.`;
  } else if (parentIssue.body.includes('### Sub-issues')) {
    // If already has a sub-issues section, append to it
    const bodyParts = parentIssue.body.split('### Sub-issues');
    const firstPart = bodyParts[0];
    const secondPart = bodyParts[1].split('\n');
    
    // Find where the task list ends
    let taskListEndIndex = 0;
    for (let i = 0; i < secondPart.length; i++) {
      if (!secondPart[i].trim().startsWith('- [ ]') && !secondPart[i].trim().startsWith('- [x]') && secondPart[i].trim() !== '') {
        taskListEndIndex = i;
        break;
      }
    }
    
    // Insert new tasks before the end of the task list
    if (taskListEndIndex > 0) {
      const tasksPart = secondPart.slice(0, taskListEndIndex);
      const restPart = secondPart.slice(taskListEndIndex);
      newParentBody = firstPart + '### Sub-issues\n\n' + tasksPart.join('\n') + '\n' + subIssueTasks + '\n' + restPart.join('\n');
    } else {
      // If there's no clear end to the task list, just append to the end
      newParentBody = firstPart + '### Sub-issues\n\n' + secondPart.join('\n') + '\n' + subIssueTasks;
    }
    
    // Add note if not already present
    if (!newParentBody.includes('> Note: Using task list format')) {
      newParentBody += '\n\n> Note: Using task list format because the GitHub sub-issues API feature is not available for this repository.';
    }
  } else {
    // If it has a body but no sub-issues section, append the section
    newParentBody = parentIssue.body + '\n\n### Sub-issues\n\n' + subIssueTasks + '\n\n> Note: Using task list format because the GitHub sub-issues API feature is not available for this repository.';
  }

  // Update the parent issue with the new body
  const updatedParentIssue = await updateIssue(owner, repo, issue_number, { body: newParentBody });
  
  // For each sub-issue, add a reference back to the parent issue
  const parentIssueReference = `${owner}/${repo}#${issue_number}`;
  
  const updatedSubIssues = [];
  for (const subIssue of sub_issues) {
    try {
      // Get the current sub-issue
      const childIssue = await getIssue(subIssue.owner, subIssue.repo, subIssue.issue_number);
      
      // Create the parent reference text
      const parentRefText = `> Part of parent issue: ${parentIssueReference}`;
      
      // Update the child issue body to include reference to parent
      let newChildBody = '';
      if (!childIssue.body) {
        newChildBody = parentRefText;
      } else if (!childIssue.body.includes(parentRefText)) {
        // Only add the reference if it's not already there
        newChildBody = `${parentRefText}\n\n${childIssue.body}`;
      } else {
        // Reference already exists, don't modify
        newChildBody = childIssue.body;
      }
      
      if (newChildBody !== childIssue.body) {
        // Update the child issue with reference to parent
        const updatedChildIssue = await updateIssue(
          subIssue.owner, 
          subIssue.repo, 
          subIssue.issue_number, 
          { body: newChildBody }
        );
        updatedSubIssues.push(updatedChildIssue);
      } else {
        updatedSubIssues.push(childIssue);
      }
    } catch (error) {
      console.error(`Error updating sub-issue ${subIssue.owner}/${subIssue.repo}#${subIssue.issue_number}:`, error);
    }
  }
  
  return {
    parent_issue: updatedParentIssue,
    updated_sub_issues: updatedSubIssues,
    fallback_used: true,
    message: "The GitHub sub-issues API feature is not available for this repository. Used task list format instead."
  };
}