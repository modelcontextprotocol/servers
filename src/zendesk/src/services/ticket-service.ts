/**
 * Service for Zendesk Support tickets
 */
import { BaseService } from "./base-service.js";
import { ZendeskTicket, ZendeskTicketComment } from "../types/ticket.types.js";
import { ZendeskConfig } from "../types/config.types.js";

/**
 * Service class for Zendesk Support tickets
 */
export class TicketService extends BaseService {
  /**
   * Creates a new TicketService instance
   * @param config Zendesk API configuration
   */
  constructor(config: ZendeskConfig) {
    super(config);
  }

  /**
   * Get detailed information about a specific Zendesk ticket
   * @param ticketId The ID of the ticket to retrieve
   * @returns Ticket data
   */
  async getTicket(ticketId: number): Promise<ZendeskTicket> {
    try {
      const ticketUrl = `/tickets/${ticketId}.json`;
      const response = await this.makeRequest<{ ticket: ZendeskTicket }>(ticketUrl);
      return response.ticket;
    } catch (error) {
      console.error(`Failed to get ticket ${ticketId}:`, error);
      throw error;
    }
  }

  /**
   * Get all comments for a specific Zendesk ticket
   * @param ticketId The ID of the ticket to get comments for
   * @returns Array of ticket comments
   */
  async getTicketComments(ticketId: number): Promise<ZendeskTicketComment[]> {
    try {
      const commentsUrl = `/tickets/${ticketId}/comments.json`;
      const response = await this.makeRequest<{ comments: ZendeskTicketComment[] }>(commentsUrl);
      return response.comments;
    } catch (error) {
      console.error(`Failed to get comments for ticket ${ticketId}:`, error);
      throw error;
    }
  }


}
