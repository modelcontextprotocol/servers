import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import * as azdev from 'azure-devops-node-api';
import { WorkItem } from '../types';

export class WorkItemManagement implements MCPFunctionGroup {
  private connection: azdev.WebApi;

  constructor() {
    // Initialize Azure DevOps connection
    const orgUrl = process.env.AZURE_DEVOPS_ORG_URL;
    const token = process.env.AZURE_PERSONAL_ACCESS_TOKEN;
    
    if (!orgUrl || !token) {
      throw new Error('Azure DevOps organization URL and PAT must be provided');
    }

    const authHandler = azdev.getPersonalAccessTokenHandler(token);
    this.connection = new azdev.WebApi(orgUrl, authHandler);
  }

  @MCPFunction({
    description: 'Get work item by ID',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Work item ID' }
      },
      required: ['id']
    }
  })
  async getWorkItem({ id }: { id: number }): Promise<WorkItem> {
    const client = await this.connection.getWorkItemTrackingApi();
    const item = await client.getWorkItem(id);
    
    return {
      id: item.id,
      title: item.fields['System.Title'],
      state: item.fields['System.State'],
      type: item.fields['System.WorkItemType'],
      description: item.fields['System.Description']
    };
  }

  @MCPFunction({
    description: 'Create new work item',
    parameters: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name' },
        type: { type: 'string', description: 'Work item type (e.g., Bug, Task, User Story)' },
        title: { type: 'string', description: 'Work item title' },
        description: { type: 'string', description: 'Work item description' }
      },
      required: ['project', 'type', 'title']
    }
  })
  async createWorkItem({ project, type, title, description }: { 
    project: string;
    type: string;
    title: string;
    description?: string;
  }): Promise<WorkItem> {
    const client = await this.connection.getWorkItemTrackingApi();
    
    const patchDocument = [
      { op: 'add', path: '/fields/System.Title', value: title },
      { op: 'add', path: '/fields/System.Description', value: description }
    ];

    const item = await client.createWorkItem(
      null,
      patchDocument,
      project,
      type
    );

    return {
      id: item.id,
      title: item.fields['System.Title'],
      state: item.fields['System.State'],
      type: item.fields['System.WorkItemType'],
      description: item.fields['System.Description']
    };
  }

  @MCPFunction({
    description: 'Update work item',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Work item ID' },
        title: { type: 'string', description: 'New title' },
        state: { type: 'string', description: 'New state' },
        description: { type: 'string', description: 'New description' }
      },
      required: ['id']
    }
  })
  async updateWorkItem({ id, title, state, description }: {
    id: number;
    title?: string;
    state?: string;
    description?: string;
  }): Promise<WorkItem> {
    const client = await this.connection.getWorkItemTrackingApi();
    
    const patchDocument = [];
    if (title) patchDocument.push({ op: 'add', path: '/fields/System.Title', value: title });
    if (state) patchDocument.push({ op: 'add', path: '/fields/System.State', value: state });
    if (description) patchDocument.push({ op: 'add', path: '/fields/System.Description', value: description });

    const item = await client.updateWorkItem(
      null,
      patchDocument,
      id
    );

    return {
      id: item.id,
      title: item.fields['System.Title'],
      state: item.fields['System.State'],
      type: item.fields['System.WorkItemType'],
      description: item.fields['System.Description']
    };
  }
}