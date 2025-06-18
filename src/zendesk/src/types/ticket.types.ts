/**
 * Type definitions for Zendesk Support tickets
 */

export interface ZendeskTicket {
  id: number;
  subject: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  requester_id: number;
  assignee_id: number;
  organization_id: number;
}

export interface ZendeskTicketComment {
  id: number;
  author_id: number;
  body: string;
  html_body: string;
  public: boolean;
  created_at: string;
}


