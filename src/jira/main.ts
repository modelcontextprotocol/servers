import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

interface JiraUser {
  self: string;
  accountId: string;
  emailAddress: string;
  avatarUrls: {
    [key: string]: string;
  };
  displayName: string;
  active: boolean;
  timeZone: string;
  accountType: string;
}

interface JiraIssueFields {
  statusCategory?: {
    self: string;
    id: number;
    key: string;
    colorName: string;
    name: string;
  };
  lastViewed?: string;
  assignee?: JiraUser;
  reporter?: JiraUser;
  creator?: JiraUser;
  summary?: string;
  description?: string;
  status?: {
    self: string;
    description: string;
    iconUrl: string;
    name: string;
    id: string;
    statusCategory: {
      self: string;
      id: number;
      key: string;
      colorName: string;
      name: string;
    };
  };
  project?: {
    self: string;
    id: string;
    key: string;
    name: string;
    projectTypeKey: string;
    simplified: boolean;
    avatarUrls: {
      [key: string]: string;
    };
  };
  created?: string;
  updated?: string;
  [key: string]: any;
}

interface JiraIssueResponse {
  fields: JiraIssueFields;
}

const server = new McpServer({
    id: "jira_mcp",
    name: "Jira MCP",
    version: "1.0.0",
});

const JIRA_USERNAME = process.env.JIRA_USERNAME;
const JIRA_API_KEY = process.env.JIRA_API_KEY;
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;

server.tool(
    'get_issue',
    'Get info about a Jira issue',
    { issue_key: z.string().describe('Jira issue key') },
    async ({ issue_key }) => {
        const response = await fetch(`${JIRA_BASE_URL}/rest/agile/1.0/issue/${issue_key}`, {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${Buffer.from(
                `${JIRA_USERNAME}:${JIRA_API_KEY}`
              ).toString('base64')}`,
              'Accept': 'application/json'
            }
          });

        const data = await response.json();
        
        // Function to remove null values from fields and move description to root
        const cleanFields = (obj: any) => {
          if (!obj.fields) return { ...obj, fields: {}, description: null };
          
          const { description, ...otherFields } = obj.fields;
          
          const cleanedFields = Object.fromEntries(
            Object.entries(otherFields)
              .filter(([_, value]) => value !== null)
          );

          return {
            ...obj,
            description: description || null,
            fields: cleanedFields
          };
        };

        const filteredData = cleanFields(data);
        return {
          content: [{ type: 'text', text: JSON.stringify(filteredData, null, 2) }]
        };
    }
);

const transport = new StdioServerTransport();
server.connect(transport);
