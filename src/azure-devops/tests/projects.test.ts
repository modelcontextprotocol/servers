import { ProjectManagement } from '../functions/projects';
import * as azdev from 'azure-devops-node-api';

jest.mock('azure-devops-node-api');

describe('ProjectManagement', () => {
  let projectManager: ProjectManagement;
  const mockCoreApi = {
    getProjects: jest.fn(),
    getProject: jest.fn(),
    createProject: jest.fn(),
    deleteProject: jest.fn()
  };

  beforeEach(() => {
    process.env.AZURE_DEVOPS_ORG_URL = 'https://dev.azure.com/test';
    process.env.AZURE_PERSONAL_ACCESS_TOKEN = 'test-token';

    (azdev.WebApi as jest.Mock).mockImplementation(() => ({
      getCoreApi: () => mockCoreApi
    }));

    projectManager = new ProjectManagement();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('listProjects', () => {
    it('should list all projects', async () => {
      const mockProjects = [
        { id: '1', name: 'Project 1', description: 'Description 1' },
        { id: '2', name: 'Project 2', description: 'Description 2' }
      ];

      mockCoreApi.getProjects.mockResolvedValue(mockProjects);

      const result = await projectManager.listProjects();

      expect(result).toEqual(mockProjects);
      expect(mockCoreApi.getProjects).toHaveBeenCalled();
    });

    it('should handle errors when listing projects', async () => {
      mockCoreApi.getProjects.mockRejectedValue(new Error('API Error'));

      await expect(projectManager.listProjects()).rejects.toThrow('Failed to list projects');
    });
  });

  describe('getProject', () => {
    it('should get project by name', async () => {
      const mockProject = {
        id: '1',
        name: 'Test Project',
        description: 'Test Description'
      };

      mockCoreApi.getProject.mockResolvedValue(mockProject);

      const result = await projectManager.getProject({ name: 'Test Project' });

      expect(result).toEqual(mockProject);
      expect(mockCoreApi.getProject).toHaveBeenCalledWith('Test Project');
    });
  });

  describe('createProject', () => {
    it('should create a new project', async () => {
      const mockProject = {
        id: '1',
        name: 'New Project',
        description: 'New Description'
      };

      mockCoreApi.createProject.mockResolvedValue(mockProject);

      const result = await projectManager.createProject({
        name: 'New Project',
        description: 'New Description'
      });

      expect(result).toEqual(mockProject);
      expect(mockCoreApi.createProject).toHaveBeenCalled();
    });
  });
});