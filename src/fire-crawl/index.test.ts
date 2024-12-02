import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import FirecrawlApp from "@mendable/firecrawl-js";
import { describe, expect, jest, test } from "@jest/globals";

jest.mock("@mendable/firecrawl-js");

interface RequestParams {
  method: string;
  params: {
    name: string;
    arguments?: Record<string, any>;
  };
}

interface BatchScrapeArgs {
  urls: string[];
  options?: {
    formats?: string[];
    [key: string]: any;
  };
}

interface StatusCheckArgs {
  id: string;
}

describe("FireCrawl Tool Tests", () => {
  let mockFirecrawlClient: jest.Mocked<any>;
  let requestHandler: (request: RequestParams) => Promise<any>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock FireCrawl client
    mockFirecrawlClient = {
      asyncBatchScrapeUrls: jest.fn(),
      checkBatchScrapeStatus: jest.fn(),
    };

    (FirecrawlApp as jest.Mock).mockImplementation(() => mockFirecrawlClient);

    // Create request handler
    requestHandler = async (request: RequestParams) => {
      const { name, arguments: args } = request.params;

      if (!args) {
        throw new Error("No arguments provided");
      }

      switch (name) {
        case "fire_crawl_batch_scrape": {
          const batchArgs = args as BatchScrapeArgs;
          if (!batchArgs.urls || !Array.isArray(batchArgs.urls)) {
            throw new Error("Invalid arguments for fire_crawl_batch_scrape");
          }
          
          const response = await mockFirecrawlClient.asyncBatchScrapeUrls(batchArgs.urls, batchArgs.options);
          if (!response.success) {
            throw new Error(response.error || "Failed to start batch scrape");
          }
          
          return {
            content: [{ 
              type: "text", 
              text: `Started batch scrape with job ID: ${response.id}` 
            }],
            isError: false
          };
        }

        case "fire_crawl_check_batch_status": {
          const statusArgs = args as StatusCheckArgs;
          if (!statusArgs.id || typeof statusArgs.id !== "string") {
            throw new Error("Invalid arguments for fire_crawl_check_batch_status");
          }
          
          const response = await mockFirecrawlClient.checkBatchScrapeStatus(statusArgs.id);
          if (!response.success) {
            throw new Error(response.error);
          }
          
          return {
            content: [{ 
              type: "text", 
              text: `Status: ${response.status}\nProgress: ${response.completed}/${response.total}` 
            }],
            isError: false
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    };
  });

  describe("Batch Scrape Tests", () => {
    test("successful batch scrape initiation", async () => {
      const urls = ["https://example1.com", "https://example2.com"];
      const options = { formats: ["markdown"] };
      const jobId = "test-batch-job-123";

      mockFirecrawlClient.asyncBatchScrapeUrls.mockResolvedValueOnce({
        success: true,
        id: jobId,
      });

      const response = await requestHandler({
        method: "tools/call",
        params: {
          name: "fire_crawl_batch_scrape",
          arguments: {
            urls,
            options,
          },
        },
      });

      expect(response.isError).toBe(false);
      expect(response.content[0].text).toContain(jobId);
      expect(mockFirecrawlClient.asyncBatchScrapeUrls).toHaveBeenCalledWith(urls, options);
    });

    test("batch scrape initiation failure", async () => {
      const urls = ["https://example1.com", "https://example2.com"];
      const options = { formats: ["markdown"] };

      mockFirecrawlClient.asyncBatchScrapeUrls.mockResolvedValueOnce({
        success: false,
        error: "Failed to start batch scrape",
      });

      await expect(requestHandler({
        method: "tools/call",
        params: {
          name: "fire_crawl_batch_scrape",
          arguments: {
            urls,
            options,
          },
        },
      })).rejects.toThrow("Failed to start batch scrape");
    });
  });

  describe("Check Status Tests", () => {
    test("successful batch status check", async () => {
      const jobId = "test-batch-job-123";
      
      mockFirecrawlClient.checkBatchScrapeStatus.mockResolvedValueOnce({
        success: true,
        status: "completed",
        total: 2,
        completed: 2,
        creditsUsed: 2,
        expiresAt: new Date(),
        data: [],
      });

      const response = await requestHandler({
        method: "tools/call",
        params: {
          name: "fire_crawl_check_batch_status",
          arguments: {
            id: jobId,
          },
        },
      });

      expect(response.isError).toBe(false);
      expect(response.content[0].text).toContain("completed");
      expect(response.content[0].text).toContain("2/2");
      expect(mockFirecrawlClient.checkBatchScrapeStatus).toHaveBeenCalledWith(jobId);
    });

    test("failed status check", async () => {
      const jobId = "test-batch-job-123";
      
      mockFirecrawlClient.checkBatchScrapeStatus.mockResolvedValueOnce({
        success: false,
        error: "Job not found"
      });

      await expect(requestHandler({
        method: "tools/call",
        params: {
          name: "fire_crawl_check_batch_status",
          arguments: {
            id: jobId,
          },
        },
      })).rejects.toThrow("Job not found");
    });
  });

  describe("Input Validation Tests", () => {
    test("batch scrape with invalid arguments", async () => {
      await expect(requestHandler({
        method: "tools/call",
        params: {
          name: "fire_crawl_batch_scrape",
          arguments: {
            // Missing required fields
          },
        },
      })).rejects.toThrow("Invalid arguments");
    });

    test("status check with invalid arguments", async () => {
      await expect(requestHandler({
        method: "tools/call",
        params: {
          name: "fire_crawl_check_batch_status",
          arguments: {
            // Missing required fields
          },
        },
      })).rejects.toThrow("Invalid arguments");
    });
  });

  describe("Error Handling Tests", () => {
    test("handles network errors", async () => {
      const urls = ["https://example.com"];
      const options = { formats: ["markdown"] };

      mockFirecrawlClient.asyncBatchScrapeUrls.mockRejectedValueOnce(new Error("Network error"));

      await expect(requestHandler({
        method: "tools/call",
        params: {
          name: "fire_crawl_batch_scrape",
          arguments: {
            urls,
            options,
          },
        },
      })).rejects.toThrow("Network error");
    });

    test("handles API errors", async () => {
      const jobId = "test-batch-job-123";
      
      mockFirecrawlClient.checkBatchScrapeStatus.mockRejectedValueOnce(new Error("API error"));

      await expect(requestHandler({
        method: "tools/call",
        params: {
          name: "fire_crawl_check_batch_status",
          arguments: {
            id: jobId,
          },
        },
      })).rejects.toThrow("API error");
    });
  });
}); 