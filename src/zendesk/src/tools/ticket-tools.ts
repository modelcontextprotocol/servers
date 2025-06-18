/**
 * MCP Tools for Zendesk Support tickets
 */
import { ZendeskClient } from "../client.js";
import { z } from "zod";

/**
 * Register ticket-related tools with the MCP server
 * @param server MCP server instance 
 * @param zendeskClient Zendesk client instance
 */
export function registerTicketTools(server: any, zendeskClient: ZendeskClient) {
  // Register ticket retrieval tool
  server.tool(
    "getTicket",
    "Retrieve a Zendesk ticket by its ID",
    {
      ticket_id: z.number().describe("The ID of the ticket to retrieve"),
    },
    async ({ ticket_id }: { ticket_id: number }) => {
      try {
        const data = await zendeskClient.getTicket(ticket_id);

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
              text: `Ticket retrieval error: ${error}`,
            },
          ],
        };
      }
    },
  );

  // Register ticket comments retrieval tool
  server.tool(
    "getTicketComments",
    "Retrieve all comments for a Zendesk ticket by its ID",
    {
      ticket_id: z.number().describe("The ID of the ticket to get comments for"),
    },
    async ({ ticket_id }: { ticket_id: number }) => {
      try {
        const data = await zendeskClient.getTicketComments(ticket_id);

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
              text: `Ticket comments retrieval error: ${error}`,
            },
          ],
        };
      }
    },
  );


}
