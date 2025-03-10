import { z } from "zod";
import { githubRequest } from "../common/utils.js";

// Schema definitions for GitHub Actions
export const GitHubWorkflowSchema = z.object({
  id: z.number(),
  node_id: z.string(),
  name: z.string(),
  path: z.string(),
  state: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  url: z.string(),
  html_url: z.string(),
  badge_url: z.string(),
});

export const GitHubWorkflowRunSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  node_id: z.string(),
  head_branch: z.string(),
  head_sha: z.string(),
  run_number: z.number(),
  event: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  workflow_id: z.number(),
  check_suite_id: z.number(),
  check_suite_node_id: z.string(),
  url: z.string(),
  html_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  run_attempt: z.number(),
  run_started_at: z.string(),
  jobs_url: z.string(),
  logs_url: z.string(),
  check_suite_url: z.string(),
  artifacts_url: z.string(),
  cancel_url: z.string(),
  rerun_url: z.string(),
  workflow_url: z.string(),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
  }).optional(),
});

export const GitHubWorkflowRunsSchema = z.object({
  total_count: z.number(),
  workflow_runs: z.array(GitHubWorkflowRunSchema),
});

export const GitHubWorkflowJobSchema = z.object({
  id: z.number(),
  run_id: z.number(),
  run_url: z.string(),
  node_id: z.string(),
  head_sha: z.string(),
  url: z.string(),
  html_url: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  started_at: z.string(),
  completed_at: z.string().nullable(),
  name: z.string(),
  steps: z.array(z.object({
    name: z.string(),
    status: z.string(),
    conclusion: z.string().nullable(),
    number: z.number(),
    started_at: z.string().nullable(),
    completed_at: z.string().nullable(),
  })),
  check_run_url: z.string(),
  labels: z.array(z.string()),
  runner_id: z.number().nullable(),
  runner_name: z.string().nullable(),
  runner_group_id: z.number().nullable(),
  runner_group_name: z.string().nullable(),
});

export const GitHubWorkflowJobsSchema = z.object({
  total_count: z.number(),
  jobs: z.array(GitHubWorkflowJobSchema),
});

export const GitHubArtifactSchema = z.object({
  id: z.number(),
  node_id: z.string(),
  name: z.string(),
  size_in_bytes: z.number(),
  url: z.string(),
  archive_download_url: z.string(),
  expired: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  expires_at: z.string(),
});

export const GitHubArtifactsSchema = z.object({
  total_count: z.number(),
  artifacts: z.array(GitHubArtifactSchema),
});

export const ListWorkflowsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  per_page: z.number().optional(),
  page: z.number().optional(),
});

export const GetWorkflowSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  workflow_id: z.union([z.string(), z.number()]),
});

export const ListWorkflowRunsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  workflow_id: z.union([z.string(), z.number()]).optional(),
  actor: z.string().optional(),
  branch: z.string().optional(),
  event: z.string().optional(),
  status: z.enum(['completed', 'action_required', 'cancelled', 'failure', 'neutral', 'skipped', 'stale', 'success', 'timed_out', 'in_progress', 'queued', 'requested', 'waiting', 'pending']).optional(),
  per_page: z.number().optional(),
  page: z.number().optional(),
  created: z.string().optional(),
  exclude_pull_requests: z.boolean().optional(),
  check_suite_id: z.number().optional(),
  head_sha: z.string().optional(),
});

export const GetWorkflowRunSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  run_id: z.number(),
});

export const ListWorkflowJobsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  run_id: z.number(),
  filter: z.enum(['latest', 'all']).optional(),
  per_page: z.number().optional(),
  page: z.number().optional(),
});

export const GetWorkflowJobSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  job_id: z.number(),
});

export const ListWorkflowRunArtifactsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  run_id: z.number(),
  per_page: z.number().optional(),
  page: z.number().optional(),
});

export const DownloadWorkflowRunLogsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  run_id: z.number(),
});

export const GetJobLogsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  job_id: z.number(),
});

// Function implementations
export async function listWorkflows(
  owner: string,
  repo: string,
  page: number = 1,
  perPage: number = 30
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows?per_page=${perPage}&page=${page}`;
  const response = await githubRequest(url);
  
  return {
    total_count: (response as any).total_count,
    workflows: z.array(GitHubWorkflowSchema).parse((response as any).workflows),
  };
}

export async function getWorkflow(
  owner: string,
  repo: string,
  workflowId: string | number
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}`;
  const response = await githubRequest(url);
  
  return GitHubWorkflowSchema.parse(response);
}

export async function listWorkflowRuns(
  owner: string,
  repo: string,
  options: Omit<z.infer<typeof ListWorkflowRunsSchema>, 'owner' | 'repo'> = {}
) {
  let url = `https://api.github.com/repos/${owner}/${repo}/actions/runs`;
  
  if (options.workflow_id) {
    url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${options.workflow_id}/runs`;
  }
  
  const queryParams = new URLSearchParams();
  
  if (options.actor) queryParams.append('actor', options.actor);
  if (options.branch) queryParams.append('branch', options.branch);
  if (options.event) queryParams.append('event', options.event);
  if (options.status) queryParams.append('status', options.status);
  if (options.per_page) queryParams.append('per_page', options.per_page.toString());
  if (options.page) queryParams.append('page', options.page.toString());
  if (options.created) queryParams.append('created', options.created);
  if (options.exclude_pull_requests) queryParams.append('exclude_pull_requests', options.exclude_pull_requests.toString());
  if (options.check_suite_id) queryParams.append('check_suite_id', options.check_suite_id.toString());
  if (options.head_sha) queryParams.append('head_sha', options.head_sha);
  
  const queryString = queryParams.toString();
  const fullUrl = queryString ? `${url}?${queryString}` : url;
  
  const response = await githubRequest(fullUrl);
  
  return GitHubWorkflowRunsSchema.parse(response);
}

export async function getWorkflowRun(
  owner: string,
  repo: string,
  runId: number
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`;
  const response = await githubRequest(url);
  
  return GitHubWorkflowRunSchema.parse(response);
}

export async function listWorkflowJobs(
  owner: string,
  repo: string,
  runId: number,
  filter: 'latest' | 'all' = 'latest',
  page: number = 1,
  perPage: number = 30
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs?filter=${filter}&per_page=${perPage}&page=${page}`;
  const response = await githubRequest(url);
  
  return GitHubWorkflowJobsSchema.parse(response);
}

export async function getWorkflowJob(
  owner: string,
  repo: string,
  jobId: number
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/jobs/${jobId}`;
  const response = await githubRequest(url);
  
  return GitHubWorkflowJobSchema.parse(response);
}

export async function listWorkflowRunArtifacts(
  owner: string,
  repo: string,
  runId: number,
  page: number = 1,
  perPage: number = 30
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/artifacts?per_page=${perPage}&page=${page}`;
  const response = await githubRequest(url);
  
  return GitHubArtifactsSchema.parse(response);
}

export async function downloadWorkflowRunLogs(
  owner: string,
  repo: string,
  runId: number
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/logs`;
  
  // This endpoint returns a redirect to a download URL
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "modelcontextprotocol/servers/github",
      "Authorization": `Bearer ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`,
    },
    redirect: "manual", // Don't follow redirects
  });
  
  if (response.status === 302) {
    const downloadUrl = response.headers.get("location");
    if (downloadUrl) {
      // Return the download URL
      return { download_url: downloadUrl };
    }
  }
  
  throw new Error(`Failed to get logs download URL: ${response.status}`);
}

export async function getJobLogs(
  owner: string,
  repo: string,
  jobId: number
) {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`;
  
  // This endpoint returns a redirect to a download URL
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "modelcontextprotocol/servers/github",
      "Authorization": `Bearer ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`,
    },
    redirect: "manual", // Don't follow redirects
  });
  
  if (response.status === 302) {
    const downloadUrl = response.headers.get("location");
    if (downloadUrl) {
      // Return the download URL
      return { download_url: downloadUrl };
    }
  }
  
  throw new Error(`Failed to get job logs download URL: ${response.status}`);
}

// Helper function to get most recent workflow run failures and their details
export async function getRecentFailedRuns(
  owner: string,
  repo: string,
  limit: number = 5
) {
  // Get failed runs
  const failedRuns: Array<{
    run: any;
    failed_jobs: Array<{
      id: number;
      name: string;
      url: string;
      steps: Array<{
        name: string;
        number: number;
        conclusion: string;
      }>;
    }>;
  }> = [];

  // List recent workflow runs with status=failure
  const failedRunsResponse = await listWorkflowRuns(owner, repo, {
    status: "failure",
    per_page: limit
  });

  // Process each failed run
  for (const run of failedRunsResponse.workflow_runs) {
    // Get the jobs for this run
    const jobsResult = await listWorkflowJobs(owner, repo, run.id);
    
    const failedJobs = jobsResult.jobs.filter((job: any) => job.conclusion === "failure");
    
    if (failedJobs.length > 0) {
      failedRuns.push({
        run: {
          id: run.id,
          name: run.name,
          url: run.html_url,
          created_at: run.created_at,
          head_sha: run.head_sha,
          head_branch: run.head_branch,
          conclusion: run.conclusion
        },
        failed_jobs: failedJobs.map((job: any) => ({
          id: job.id,
          name: job.name,
          url: job.html_url,
          steps: job.steps.filter((step: any) => step.conclusion === "failure").map((step: any) => ({
            name: step.name,
            number: step.number,
            conclusion: step.conclusion
          }))
        }))
      });
    }
  }

  return failedRuns;
} 