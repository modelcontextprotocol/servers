import { z } from "zod";

// Definition of Basic Types
export const GiteeUserSchema = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
  url: z.string().url(),
  html_url: z.string().url(),
  remark: z.string().nullable(),
  followers_url: z.string().url(),
  following_url: z.string().url(),
  gists_url: z.string().url(),
  starred_url: z.string().url(),
  subscriptions_url: z.string().url(),
  organizations_url: z.string().url(),
  repos_url: z.string().url(),
  events_url: z.string().url(),
  received_events_url: z.string().url(),
  type: z.string(),
  site_admin: z.boolean().optional().default(false),
  blog: z.string().nullable().optional(),
  weibo: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  public_repos: z.number().optional(),
  public_gists: z.number().optional(),
  followers: z.number().optional(),
  following: z.number().optional(),
  stared: z.number().optional(),
  watched: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  email: z.string().email().nullable().optional(),
});

// Type Exports
export type GiteeUser = z.infer<typeof GiteeUserSchema>;
