/**
 * Main Zendesk client that serves as a facade for all specialized services
 */
import * as readline from "node:readline";
import { ZendeskConfig } from "./types/config.types.js";
import { ArticleService } from "./services/article-service.js";
import { TicketService } from "./services/ticket-service.js";
import { 
  ArticleSearchParams, 
  ZendeskArticleResponse, 
  ZendeskSearchResponse 
} from "./types/article.types.js";
import { 
  ZendeskTicket, 
  ZendeskTicketComment 
} from "./types/ticket.types.js";

/**
 * Zendesk client that provides access to all Zendesk API features
 * Acts as a facade to coordinate between specialized services
 */
export class ZendeskClient {
  private articleService: ArticleService;
  private ticketService: TicketService;
  private defaultLocale: string;
  private config: ZendeskConfig;

  /**
   * Creates a new Zendesk client instance
   * @param config Configuration for Zendesk API
   */
  constructor(config: ZendeskConfig) {
    this.config = config;
    this.defaultLocale = config.defaultLocale || "en";
    
    // Initialize services
    this.articleService = new ArticleService(config);
    this.ticketService = new TicketService(config);
  }

  /**
   * Search for articles in Zendesk Help Center
   * @param params Search parameters including query, locale, page, and per_page
   * @returns Search results with filtered article data
   */
  async searchArticles(params: ArticleSearchParams): Promise<ZendeskSearchResponse> {
    return this.articleService.searchArticles(params);
  }

  /**
   * Get detailed information about a specific article
   * @param params Parameters including article ID and locale
   * @returns Article data with cleaned HTML content
   */
  async getArticle(params: { id: number; locale?: string; }): Promise<ZendeskArticleResponse> {
    return this.articleService.getArticle(params);
  }

  /**
   * Get detailed information about a specific Zendesk ticket
   * @param ticketId The ID of the ticket to retrieve
   * @returns Ticket data
   */
  async getTicket(ticketId: number): Promise<ZendeskTicket> {
    return this.ticketService.getTicket(ticketId);
  }

  /**
   * Get all comments for a specific Zendesk ticket
   * @param ticketId The ID of the ticket to get comments for
   * @returns Array of ticket comments
   */
  async getTicketComments(ticketId: number): Promise<ZendeskTicketComment[]> {
    return this.ticketService.getTicketComments(ticketId);
  }



  /**
   * Run an interactive command-line interface for testing the client
   * Allows searching for articles and retrieving article details
   */
  async chatLoop(): Promise<void> {
    console.log("\nZendesk Help Center client started!");
    console.log("Enter a command ('quit' to exit):");
    console.log("- search <keyword> [locale] [page] [per_page]");
    console.log("- article <articleID> [locale]");
    console.log("- ticket <ticketID>");
    console.log("- comments <ticketID>");

    // Use Node.js readline to process console input
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const askQuestion = () => {
      rl.question("\nCommand: ", async (input: string) => {
        try {
          if (input.toLowerCase() === "quit") {
            rl.close();
            return;
          }

          const parts = input.split(" ");
          const command = parts[0].toLowerCase();

          if (command === "search") {
            if (parts.length < 2) {
              console.log("Usage: search <keyword> [locale] [page] [per_page]");
            } else {
              const query = parts[1];
              const locale = parts[2] || this.defaultLocale;
              const page = Number.parseInt(parts[3]) || 1;
              const per_page = Number.parseInt(parts[4]) || 20;

              const results = await this.searchArticles({
                query,
                locale,
                page,
                per_page,
              });
              console.log(JSON.stringify(results, null, 2));
            }
          } else if (command === "article") {
            if (parts.length < 2) {
              console.log("Usage: article <articleID> [locale]");
            } else {
              const id = Number.parseInt(parts[1]);
              const locale = parts[2] || this.defaultLocale;
              const article = await this.getArticle({ id, locale });
              console.log(JSON.stringify(article, null, 2));
            }
          } else if (command === "ticket") {
            if (parts.length < 2) {
              console.log("Usage: ticket <ticketID>");
            } else {
              const ticketId = Number.parseInt(parts[1]);
              const ticket = await this.getTicket(ticketId);
              console.log(JSON.stringify(ticket, null, 2));
            }
          } else if (command === "comments") {
            if (parts.length < 2) {
              console.log("Usage: comments <ticketID>");
            } else {
              const ticketId = Number.parseInt(parts[1]);
              const comments = await this.getTicketComments(ticketId);
              console.log(JSON.stringify(comments, null, 2));
            }
          } else {
            console.log("Unknown command. Available commands: search, article, ticket, comments, quit");
          }

          askQuestion();
        } catch (error) {
          console.error("\nError:", error);
          askQuestion();
        }
      });
    };

    askQuestion();
  }
}
