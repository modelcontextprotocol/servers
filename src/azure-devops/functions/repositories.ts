import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import * as azdev from 'azure-devops-node-api';
import { Repository } from '../types';

export class RepositoryManagement implements MCPFunctionGroup {
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
    description: 'List repositories in a project',
    parameters: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name' }
      },
      required: ['project']
    }
  })
  async listRepositories({ project }: { project: string }): Promise<Repository[]> {
    const client = await this.connection.getGitApi();
    const repos = await client.getRepositories(project);
    
    return repos.map(repo => ({
      id: repo.id,
      name: repo.name,
      defaultBranch: repo.defaultBranch,
      url: repo.url
    }));
  }

  @MCPFunction({
    description: 'Create new repository',
    parameters: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name' },
        name: { type: 'string', description: 'Repository name' }
      },
      required: ['project', 'name']
    }
  })
  async createRepository({ project, name }: { 
    project: string;
    name: string;
  }): Promise<Repository> {
    const client = await this.connection.getGitApi();
    
    const repo = await client.createRepository({
      name,
      project: { name: project }
    });

    return {
      id: repo.id,
      name: repo.name,
      defaultBranch: repo.defaultBranch,
      url: repo.url
    };
  }

  @MCPFunction({
    description: 'Delete repository',
    parameters: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name' },
        name: { type: 'string', description: 'Repository name' }
      },
      required: ['project', 'name']
    }
  })
  async deleteRepository({ project, name }: { 
    project: string;
    name: string;
  }): Promise<void> {
    const client = await this.connection.getGitApi();
    const repos = await client.getRepositories(project);
    const repo = repos.find(r => r.name === name);
    
    if (!repo) {
      throw new Error(`Repository ${name} not found in project ${project}`);
    }

    await client.deleteRepository(repo.id);
  }

  @MCPFunction({
    description: 'Get repository branches',
    parameters: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name' },
        repository: { type: 'string', description: 'Repository name' }
      },
      required: ['project', 'repository']
    }
  })
  async getBranches({ project, repository }: {
    project: string;
    repository: string;
  }): Promise<string[]> {
    const client = await this.connection.getGitApi();
    const repos = await client.getRepositories(project);
    const repo = repos.find(r => r.name === repository);
    
    if (!repo) {
      throw new Error(`Repository ${repository} not found in project ${project}`);
    }

    const branches = await client.getBranches(repo.id);
    return branches.map(branch => branch.name);
  }
}