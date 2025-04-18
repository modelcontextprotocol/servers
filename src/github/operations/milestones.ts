import { z } from "zod";
import { githubRequest, buildUrl } from "../common/utils.js";

// Schemas for Milestone Operations
export const ListMilestonesSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  state: z.enum(["open", "closed", "all"]).optional().default("open"),
  sort: z.enum(["due_on", "completeness"]).optional().default("due_on"),
  direction: z.enum(["asc", "desc"]).optional().default("asc"),
  per_page: z.number().optional(),
  page: z.number().optional(),
});

export const CreateMilestoneSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  title: z.string(),
  state: z.enum(["open", "closed"]).optional().default("open"),
  description: z.string().optional(),
  due_on: z.string().optional(), // ISO 8601 format timestamp
});

export const GetMilestoneSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  milestone_number: z.number(),
});

export const UpdateMilestoneSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  milestone_number: z.number(),
  title: z.string().optional(),
  state: z.enum(["open", "closed"]).optional(),
  description: z.string().optional(),
  due_on: z.string().optional(), // ISO 8601 format timestamp
});

export const DeleteMilestoneSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  milestone_number: z.number(),
});

// Functions for Milestone Operations

export async function listMilestones(
  owner: string,
  repo: string,
  options: Omit<z.infer<typeof ListMilestonesSchema>, "owner" | "repo">
) {
  const urlParams: Record<string, string | undefined> = {
    state: options.state,
    sort: options.sort,
    direction: options.direction,
    page: options.page?.toString(),
    per_page: options.per_page?.toString(),
  };
  return githubRequest(
    buildUrl(`https://api.github.com/repos/${owner}/${repo}/milestones`, urlParams)
  );
}

export async function createMilestone(
  owner: string,
  repo: string,
  options: Omit<z.infer<typeof CreateMilestoneSchema>, "owner" | "repo">
) {
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/milestones`,
    {
      method: "POST",
      body: options,
    }
  );
}

export async function getMilestone(
  owner: string,
  repo: string,
  milestone_number: number
) {
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/milestones/${milestone_number}`
  );
}

export async function updateMilestone(
  owner: string,
  repo: string,
  milestone_number: number,
  options: Omit<z.infer<typeof UpdateMilestoneSchema>, "owner" | "repo" | "milestone_number">
) {
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/milestones/${milestone_number}`,
    {
      method: "PATCH",
      body: options,
    }
  );
}

export async function deleteMilestone(
  owner: string,
  repo: string,
  milestone_number: number
) {
  return githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/milestones/${milestone_number}`,
    {
      method: "DELETE",
    }
  );
} 