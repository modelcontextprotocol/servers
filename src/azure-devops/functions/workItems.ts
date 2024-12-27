import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import * as azdev from 'azure-devops-node-api';
import { WorkItem } from '../types';

/**
 * WorkItemManagement class handles all work item related operations in Azure DevOps
 * through the Model Context Protocol interface.
 * 
 * @implements {MCPFunctionGroup}
 */
export class WorkItemManagement implements MCPFunctionGroup {
  private connection: azdev.WebApi;

  /**
   * Initializes the WorkItemManagement with Azure DevOps credentials
   * @throws {Error} If required environment variables are not set
   */
  constructor() {
    const orgUrl = process.env.AZURE_DEVOPS_ORG_URL;
    const token = process.env.AZURE_PERSONAL_ACCESS_TOKEN;
    
    if (!orgUrl || !token) {
      throw new Error('Azure DevOps organization URL and PAT must be provided');
    }

    const authHandler = azdev.getPersonalAccessTokenHandler(token);
    this.connection = new azdev.WebApi(orgUrl, authHandler);
  }

  /**
   * Retrieves a work item by its ID
   * 
   * @param {Object} params - Parameters for the function
   * @param {number} params.id - The ID of the work item to retrieve
   * @returns {Promise<WorkItem>} The requested work item
   * @throws {Error} If the work item is not found or access is denied
   */
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
    try {
      const client = await this.connection.getWorkItemTrackingApi();
      const item = await client.getWorkItem(id);
      
      if (!item) {
        throw new Error(`Work item ${id} not found`);
      }

      return {
        id: item.id,
        title: item.fields['System.Title'],
        state: item.fields['System.State'],
        type: item.fields['System.WorkItemType'],
        description: item.fields['System.Description']
      };
    } catch (error) {
      throw new Error(`Failed to get work item ${id}: ${error.message}`);
    }
  }

  /**
   * Creates a new work item
   * 
   * @param {Object} params - Parameters for creating the work item
   * @param {string} params.project - The project where the work item will be created
   * @param {string} params.type - The type of work item (e.g., Bug, Task, User Story)
   * @param {string} params.title - The title of the work item
   * @param {string} [params.description] - Optional description for the work item
   * @returns {Promise<WorkItem>} The created work item
   * @throws {Error} If creation fails or parameters are invalid
   */
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
    try {
      const client = await this.connection.getWorkItemTrackingApi();
      
      const patchDocument = [
        { op: 'add', path: '/fields/System.Title', value: title }
      ];

      if (description) {
        patchDocument.push({ op: 'add', path: '/fields/System.Description', value: description });
      }

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
    } catch (error) {
      throw new Error(`Failed to create work item: ${error.message}`);
    }
  }

  /**
   * Updates an existing work item
   * 
   * @param {Object} params - Parameters for updating the work item
   * @param {number} params.id - The ID of the work item to update
   * @param {string} [params.title] - New title for the work item
   * @param {string} [params.state] - New state for the work item
   * @param {string} [params.description] - New description for the work item
   * @returns {Promise<WorkItem>} The updated work item
   * @throws {Error} If update fails or work item is not found
   */
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
    try {
      const client = await this.connection.getWorkItemTrackingApi();
      
      const patchDocument = [];
      if (title) patchDocument.push({ op: 'add', path: '/fields/System.Title', value: title });
      if (state) patchDocument.push({ op: 'add', path: '/fields/System.State', value: state });
      if (description) patchDocument.push({ op: 'add', path: '/fields/System.Description', value: description });

      if (patchDocument.length === 0) {
        throw new Error('No updates specified');
      }

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
    } catch (error) {
      throw new Error(`Failed to update work item ${id}: ${error.message}`);
    }
  }
}