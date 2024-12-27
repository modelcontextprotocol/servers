import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import * as azdev from 'azure-devops-node-api';
import { Project } from '../types';

export class ProjectManagement implements MCPFunctionGroup {
  private connection: azdev.WebApi;

  constructor() {
    const orgUrl = process.env.AZURE_DEVOPS_ORG_URL;
    const token = process.env.AZURE_PERSONAL_ACCESS_TOKEN;
    
    if (!orgUrl || !token) {
      throw new Error('Azure DevOps organization URL and PAT must be provided');
    }

    const authHandler = azdev.getPersonalAccessTokenHandler(token);
    this.connection = new azdev.WebApi(orgUrl, authHandler);
  }

  @MCPFunction({
    description: 'List all projects',
    parameters: {
      type: 'object',
      properties: {}
    }
  })
  async listProjects(): Promise<Project[]> {
    const client = await this.connection.getCoreApi();
    const projects = await client.getProjects();
    
    return projects.map(project => ({
      id: project.id,
      name: project.name,
      description: project.description
    }));
  }

  @MCPFunction({
    description: 'Get project by name',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' }
      },
      required: ['name']
    }
  })
  async getProject({ name }: { name: string }): Promise<Project> {
    const client = await this.connection.getCoreApi();
    const project = await client.getProject(name);
    
    return {
      id: project.id,
      name: project.name,
      description: project.description
    };
  }

  @MCPFunction({
    description: 'Create new project',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        description: { type: 'string', description: 'Project description' }
      },
      required: ['name']
    }
  })
  async createProject({ name, description }: { 
    name: string;
    description?: string;
  }): Promise<Project> {
    const client = await this.connection.getCoreApi();
    
    const project = await client.createProject({
      name,
      description,
      capabilities: {
        versioncontrol: { sourceControlType: 'Git' },
        processTemplate: { templateTypeId: '6b724908-ef14-45cf-84f8-768b5384da45' } // Basic process
      }
    });

    return {
      id: project.id,
      name: project.name,
      description: project.description
    };
  }

  @MCPFunction({
    description: 'Delete project',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' }
      },
      required: ['name']
    }
  })
  async deleteProject({ name }: { name: string }): Promise<void> {
    const client = await this.connection.getCoreApi();
    await client.deleteProject(name);
  }
}