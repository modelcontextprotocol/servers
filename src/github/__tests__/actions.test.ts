import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as actions from '../operations/actions.js';

// Mock the Github API requests
vi.mock('../common/utils.js', () => ({
  githubRequest: vi.fn(),
}));

import { githubRequest } from '../common/utils.js';

describe('GitHub Actions API', () => {
  const mockOwner = 'testOwner';
  const mockRepo = 'testRepo';
  const mockWorkflowId = 123;
  const mockRunId = 456;
  const mockJobId = 789;
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('listWorkflows', () => {
    it('should fetch workflows from the GitHub API', async () => {
      const mockResponse = {
        total_count: 2,
        workflows: [
          {
            id: 1,
            node_id: 'node1',
            name: 'CI',
            path: '.github/workflows/ci.yml',
            state: 'active',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z',
            url: 'https://api.github.com/repos/testOwner/testRepo/actions/workflows/1',
            html_url: 'https://github.com/testOwner/testRepo/actions/workflows/1',
            badge_url: 'https://github.com/testOwner/testRepo/workflows/CI/badge.svg',
          },
          {
            id: 2,
            node_id: 'node2',
            name: 'CD',
            path: '.github/workflows/cd.yml',
            state: 'active',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z',
            url: 'https://api.github.com/repos/testOwner/testRepo/actions/workflows/2',
            html_url: 'https://github.com/testOwner/testRepo/actions/workflows/2',
            badge_url: 'https://github.com/testOwner/testRepo/workflows/CD/badge.svg',
          },
        ],
      };

      (githubRequest as any).mockResolvedValue(mockResponse);

      const result = await actions.listWorkflows(mockOwner, mockRepo);

      expect(githubRequest).toHaveBeenCalledWith(
        `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/workflows?per_page=30&page=1`
      );
      expect(result).toEqual({
        total_count: 2,
        workflows: mockResponse.workflows,
      });
    });
  });

  describe('getWorkflow', () => {
    it('should fetch a specific workflow from the GitHub API', async () => {
      const mockResponse = {
        id: mockWorkflowId,
        node_id: 'node1',
        name: 'CI',
        path: '.github/workflows/ci.yml',
        state: 'active',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/workflows/${mockWorkflowId}`,
        html_url: `https://github.com/${mockOwner}/${mockRepo}/actions/workflows/${mockWorkflowId}`,
        badge_url: `https://github.com/${mockOwner}/${mockRepo}/workflows/CI/badge.svg`,
      };

      (githubRequest as any).mockResolvedValue(mockResponse);

      const result = await actions.getWorkflow(mockOwner, mockRepo, mockWorkflowId);

      expect(githubRequest).toHaveBeenCalledWith(
        `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/workflows/${mockWorkflowId}`
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('listWorkflowRuns', () => {
    it('should fetch workflow runs from the GitHub API', async () => {
      const mockResponse = {
        total_count: 1,
        workflow_runs: [
          {
            id: mockRunId,
            name: 'CI',
            node_id: 'node1',
            head_branch: 'main',
            head_sha: 'abc123',
            run_number: 1,
            event: 'push',
            status: 'completed',
            conclusion: 'success',
            workflow_id: mockWorkflowId,
            check_suite_id: 1,
            check_suite_node_id: 'cs_node1',
            url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}`,
            html_url: `https://github.com/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}`,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-02T00:00:00Z',
            run_attempt: 1,
            run_started_at: '2023-01-01T00:00:00Z',
            jobs_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}/jobs`,
            logs_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}/logs`,
            check_suite_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/check-suites/1`,
            artifacts_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}/artifacts`,
            cancel_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}/cancel`,
            rerun_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}/rerun`,
            workflow_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/workflows/${mockWorkflowId}`,
            repository: {
              id: 1,
              name: mockRepo,
              full_name: `${mockOwner}/${mockRepo}`,
            },
          },
        ],
      };

      (githubRequest as any).mockResolvedValue(mockResponse);

      const result = await actions.listWorkflowRuns(mockOwner, mockRepo);

      expect(githubRequest).toHaveBeenCalledWith(
        `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs`
      );
      expect(result).toEqual(mockResponse);
    });

    it('should filter workflow runs when options are provided', async () => {
      const mockResponse = {
        total_count: 1,
        workflow_runs: [],
      };

      (githubRequest as any).mockResolvedValue(mockResponse);

      await actions.listWorkflowRuns(mockOwner, mockRepo, {
        workflow_id: mockWorkflowId,
        status: 'failure',
        branch: 'main',
      });

      expect(githubRequest).toHaveBeenCalledWith(
        expect.stringContaining(`https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/workflows/${mockWorkflowId}/runs`)
      );
      expect(githubRequest).toHaveBeenCalledWith(
        expect.stringContaining('branch=main')
      );
      expect(githubRequest).toHaveBeenCalledWith(
        expect.stringContaining('status=failure')
      );
    });
  });

  describe('getWorkflowRun', () => {
    it('should fetch a specific workflow run from the GitHub API', async () => {
      const mockResponse = {
        id: mockRunId,
        name: 'CI',
        node_id: 'node1',
        head_branch: 'main',
        head_sha: 'abc123',
        run_number: 1,
        event: 'push',
        status: 'completed',
        conclusion: 'success',
        workflow_id: mockWorkflowId,
        check_suite_id: 1,
        check_suite_node_id: 'cs_node1',
        url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}`,
        html_url: `https://github.com/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}`,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        run_attempt: 1,
        run_started_at: '2023-01-01T00:00:00Z',
        jobs_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}/jobs`,
        logs_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}/logs`,
        check_suite_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/check-suites/1`,
        artifacts_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}/artifacts`,
        cancel_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}/cancel`,
        rerun_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}/rerun`,
        workflow_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/workflows/${mockWorkflowId}`,
      };

      (githubRequest as any).mockResolvedValue(mockResponse);

      const result = await actions.getWorkflowRun(mockOwner, mockRepo, mockRunId);

      expect(githubRequest).toHaveBeenCalledWith(
        `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}`
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('listWorkflowJobs', () => {
    it('should fetch workflow jobs from the GitHub API', async () => {
      const mockResponse = {
        total_count: 1,
        jobs: [
          {
            id: mockJobId,
            run_id: mockRunId,
            run_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}`,
            node_id: 'node1',
            head_sha: 'abc123',
            url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/jobs/${mockJobId}`,
            html_url: `https://github.com/${mockOwner}/${mockRepo}/runs/${mockRunId}/jobs/${mockJobId}`,
            status: 'completed',
            conclusion: 'success',
            started_at: '2023-01-01T00:00:00Z',
            completed_at: '2023-01-02T00:00:00Z',
            name: 'build',
            steps: [
              {
                name: 'Set up job',
                status: 'completed',
                conclusion: 'success',
                number: 1,
                started_at: '2023-01-01T00:00:00Z',
                completed_at: '2023-01-01T00:01:00Z',
              },
            ],
            check_run_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/check-runs/1`,
            labels: ['ubuntu-latest'],
            runner_id: 1,
            runner_name: 'GitHub Actions 1',
            runner_group_id: 1,
            runner_group_name: 'Default',
          },
        ],
      };

      (githubRequest as any).mockResolvedValue(mockResponse);

      const result = await actions.listWorkflowJobs(mockOwner, mockRepo, mockRunId);

      expect(githubRequest).toHaveBeenCalledWith(
        `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}/jobs?filter=latest&per_page=30&page=1`
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getWorkflowJob', () => {
    it('should fetch a specific job from the GitHub API', async () => {
      const mockResponse = {
        id: mockJobId,
        run_id: mockRunId,
        run_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}`,
        node_id: 'node1',
        head_sha: 'abc123',
        url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/jobs/${mockJobId}`,
        html_url: `https://github.com/${mockOwner}/${mockRepo}/runs/${mockRunId}/jobs/${mockJobId}`,
        status: 'completed',
        conclusion: 'success',
        started_at: '2023-01-01T00:00:00Z',
        completed_at: '2023-01-02T00:00:00Z',
        name: 'build',
        steps: [
          {
            name: 'Set up job',
            status: 'completed',
            conclusion: 'success',
            number: 1,
            started_at: '2023-01-01T00:00:00Z',
            completed_at: '2023-01-01T00:01:00Z',
          },
        ],
        check_run_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/check-runs/1`,
        labels: ['ubuntu-latest'],
        runner_id: 1,
        runner_name: 'GitHub Actions 1',
        runner_group_id: 1,
        runner_group_name: 'Default',
      };

      (githubRequest as any).mockResolvedValue(mockResponse);

      const result = await actions.getWorkflowJob(mockOwner, mockRepo, mockJobId);

      expect(githubRequest).toHaveBeenCalledWith(
        `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/jobs/${mockJobId}`
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('listWorkflowRunArtifacts', () => {
    it('should fetch workflow run artifacts from the GitHub API', async () => {
      const mockResponse = {
        total_count: 1,
        artifacts: [
          {
            id: 1,
            node_id: 'node1',
            name: 'build-artifacts',
            size_in_bytes: 1024,
            url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/artifacts/1`,
            archive_download_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/artifacts/1/zip`,
            expired: false,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
            expires_at: '2023-02-01T00:00:00Z',
          },
        ],
      };

      (githubRequest as any).mockResolvedValue(mockResponse);

      const result = await actions.listWorkflowRunArtifacts(mockOwner, mockRepo, mockRunId);

      expect(githubRequest).toHaveBeenCalledWith(
        `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}/artifacts?per_page=30&page=1`
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getRecentFailedRuns', () => {
    it('should fetch and aggregate recent failed workflow runs', async () => {
      // Mock the list of failed workflow runs
      (githubRequest as any).mockResolvedValueOnce({
        total_count: 1,
        workflow_runs: [
          {
            id: mockRunId,
            name: 'CI',
            html_url: `https://github.com/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}`,
            created_at: '2023-01-01T00:00:00Z',
            head_sha: 'abc123',
            head_branch: 'main',
            conclusion: 'failure',
            node_id: 'node1',
            run_number: 1,
            event: 'push',
            status: 'completed',
            workflow_id: mockWorkflowId,
            check_suite_id: 1,
            check_suite_node_id: 'cs_node1',
            url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}`,
            updated_at: '2023-01-02T00:00:00Z',
            run_attempt: 1,
            run_started_at: '2023-01-01T00:00:00Z',
            jobs_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}/jobs`,
            logs_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}/logs`,
            check_suite_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/check-suites/1`,
            artifacts_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}/artifacts`,
            cancel_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}/cancel`,
            rerun_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}/rerun`,
            workflow_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/workflows/${mockWorkflowId}`
          },
        ],
      });

      // Mock the job list for the failed run
      (githubRequest as any).mockResolvedValueOnce({
        total_count: 1,
        jobs: [
          {
            id: mockJobId,
            name: 'build',
            html_url: `https://github.com/${mockOwner}/${mockRepo}/runs/${mockRunId}/jobs/${mockJobId}`,
            conclusion: 'failure',
            steps: [
              {
                name: 'Run tests',
                number: 2,
                conclusion: 'failure',
                status: 'completed',
                started_at: '2023-01-01T00:00:00Z',
                completed_at: '2023-01-01T00:01:00Z'
              },
            ],
            run_id: mockRunId,
            run_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/runs/${mockRunId}`,
            node_id: 'node1',
            head_sha: 'abc123',
            url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/actions/jobs/${mockJobId}`,
            status: 'completed',
            started_at: '2023-01-01T00:00:00Z',
            completed_at: '2023-01-02T00:00:00Z',
            check_run_url: `https://api.github.com/repos/${mockOwner}/${mockRepo}/check-runs/1`,
            labels: ['ubuntu-latest'],
            runner_id: 1,
            runner_name: 'GitHub Actions 1',
            runner_group_id: 1,
            runner_group_name: 'Default'
          },
        ],
      });

      const result = await actions.getRecentFailedRuns(mockOwner, mockRepo);

      expect(githubRequest).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
      expect(result[0].run.id).toBe(mockRunId);
      expect(result[0].failed_jobs).toHaveLength(1);
      expect(result[0].failed_jobs[0].id).toBe(mockJobId);
      expect(result[0].failed_jobs[0].steps).toHaveLength(1);
      expect(result[0].failed_jobs[0].steps[0].name).toBe('Run tests');
    });
  });
}); 