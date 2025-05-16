/**
 * Type definitions for Zendesk API configuration
 */

// Configuration interface for the Zendesk API client
export interface ZendeskConfig {
  subdomain: string;
  email: string;
  apiToken: string;
  defaultLocale?: string;
}
