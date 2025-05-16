/**
 * MCP Tools for Zendesk Help Center articles
 */
import { ZendeskClient } from "../client.js";
import { z } from "zod";

/**
 * Register article-related tools with the MCP server
 * @param server MCP server instance 
 * @param zendeskClient Zendesk client instance
 * @param defaultLocale Default locale for API requests
 */
export function registerArticleTools(server: any, zendeskClient: ZendeskClient, defaultLocale: string) {
  // Register article search tool
  server.tool(
    "searchArticles",
    "Search for articles in Zendesk Help Center",
    {
      query: z.string().describe("Search keyword"),
      locale: z.string().optional().describe("Locale code (e.g., 'ja', 'en-us')"),
      page: z.number().optional().describe("Page number"),
      per_page: z.number().optional().describe("Number of results per page (max 100)"),
    },
    async ({ query, locale = defaultLocale, page = 1, per_page = 20 }: { query: string; locale?: string; page?: number; per_page?: number }) => {
      try {
        const data = await zendeskClient.searchArticles({
          query,
          locale,
          page,
          per_page,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Search error: ${error}`,
            },
          ],
        };
      }
    },
  );

  // Register article detail retrieval tool
  server.tool(
    "getArticle",
    "Get details of a specific Zendesk Help Center article by ID",
    {
      id: z.number().describe("Article ID"),
      locale: z.string().optional().describe("Locale code (e.g., 'ja', 'en-us')"),
    },
    async ({ id, locale = defaultLocale }: { id: number; locale?: string }) => {
      try {
        const data = await zendeskClient.getArticle({ id, locale });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Article retrieval error: ${error}`,
            },
          ],
        };
      }
    },
  );
}
