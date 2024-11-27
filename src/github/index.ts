import { Octokit } from "@octokit/rest";
import { Server, ServerSchema } from "@modelcontext/sdk";
import z from "zod";

const schema = ServerSchema.extend({
  functions: z.object({
    // ... existing functions
    
    // Add PR read access
    getPullRequest: z.function()
      .args(z.object({
        owner: z.string(),
        repo: z.string(),
        pull_number: z.number()
      }))
      .returns(z.promise(z.any())),

    listPullRequests: z.function()
      .args(z.object({
        owner: z.string(),
        repo: z.string(),
        state: z.enum(["open", "closed", "all"]).optional(),
        head: z.string().optional(),
        base: z.string().optional(),
        sort: z.enum(["created", "updated", "popularity", "long-running"]).optional(),
        direction: z.enum(["asc", "desc"]).optional(),
        per_page: z.number().min(1).max(100).optional(),
        page: z.number().min(1).optional()
      }))
      .returns(z.promise(z.array(z.any())))
  })
});

export class GitHubServer extends Server {
  private octokit: Octokit;

  constructor(token: string) {
    super();
    this.octokit = new Octokit({ auth: token });
  }

  // ... existing methods

  async getPullRequest({ owner, repo, pull_number }) {
    const response = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number
    });
    return response.data;
  }

  async listPullRequests({ owner, repo, state, head, base, sort, direction, per_page, page }) {
    const response = await this.octokit.pulls.list({
      owner,
      repo,
      state,
      head,
      base,
      sort,
      direction,
      per_page,
      page
    });
    return response.data;
  }
}