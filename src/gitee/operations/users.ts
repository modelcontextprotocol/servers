import { z } from "zod";
import { giteeRequest, validateOwnerName } from "../common/utils.js";
import { GiteeUserSchema } from "../common/types.js";

// Schema definitions
export const GetUserSchema = z.object({
  // 用户名
  username: z.string().describe("Username"),
});

export const SearchUsersSchema = z.object({
  // 搜索关键词
  q: z.string().describe("Search keyword"),
  // 当前的页码
  page: z.number().int().min(1).default(1).optional().describe("Page number"),
  // 每页的数量，最大为 100
  per_page: z.number().int().min(1).max(100).default(30).optional().describe("Number of items per page, maximum 100"),
  // 排序字段
  sort: z.enum(["followers", "repositories", "joined"]).default("followers").optional().describe("Sort field"),
  // 排序方式
  order: z.enum(["desc", "asc"]).default("desc").optional().describe("Sort direction"),
});

// Type exports
export type GetUserOptions = z.infer<typeof GetUserSchema>;
export type SearchUsersOptions = z.infer<typeof SearchUsersSchema>;

// Function implementations
export async function getUser(username: string) {
  username = validateOwnerName(username);

  const url = `https://gitee.com/api/v5/users/${username}`;
  const response = await giteeRequest(url, "GET");

  return GiteeUserSchema.parse(response);
}

export async function getCurrentUser() {
  const url = "https://gitee.com/api/v5/user";
  const response = await giteeRequest(url, "GET");

  return GiteeUserSchema.parse(response);
}

export async function searchUsers(options: SearchUsersOptions) {
  const { q, page, per_page, sort, order } = options;

  const url = new URL("https://gitee.com/api/v5/search/users");
  url.searchParams.append("q", q);
  if (page !== undefined) {
    url.searchParams.append("page", page.toString());
  }
  if (per_page !== undefined) {
    url.searchParams.append("per_page", per_page.toString());
  }
  if (sort) {
    url.searchParams.append("sort", sort);
  }
  if (order) {
    url.searchParams.append("order", order);
  }

  const response = await giteeRequest(url.toString(), "GET");

  return {
    total_count: (response as any).total_count || 0,
    items: z.array(GiteeUserSchema).parse((response as any).items || []),
  };
}
