import { RepositoryManagement } from '../functions/repositories';
import * as azdev from 'azure-devops-node-api';

jest.mock('azure-devops-node-api');

describe('RepositoryManagement', () => {
  let repoManager: RepositoryManagement;
  const mockGitApi = {
    getRepositories: jest.fn(),
    createRepository: jest.fn(),
    deleteRepository: jest.fn(),
    getBranches: jest.fn()
  };

  beforeEach(() => {
    process.env.AZURE_DEVOPS_ORG_URL = 'https://dev.azure.com/test';
    process.env.AZURE_PERSONAL_ACCESS_TOKEN = 'test-token';

    (azdev.WebApi as jest.Mock).mockImplementation(() => ({
      getGitApi: () => mockGitApi
    }));

    repoManager = new RepositoryManagement();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('listRepositories', () => {
    it('should list repositories in a project', async () => {
      const mockRepos = [
        {
          id: '1',
          name: 'Repo 1',
          defaultBranch: 'main',
          url: 'https://example.com/repo1'
        },
        {
          id: '2',
          name: 'Repo 2',
          defaultBranch: 'main',
          url: 'https://example.com/repo2'
        }
      ];

      mockGitApi.getRepositories.mockResolvedValue(mockRepos);

      const result = await repoManager.listRepositories({ project: 'Test Project' });

      expect(result).toEqual(mockRepos);
      expect(mockGitApi.getRepositories).toHaveBeenCalledWith('Test Project');
    });
  });

  describe('createRepository', () => {
    it('should create a new repository', async () => {
      const mockRepo = {
        id: '1',
        name: 'New Repo',
        defaultBranch: 'main',
        url: 'https://example.com/new-repo'
      };

      mockGitApi.createRepository.mockResolvedValue(mockRepo);

      const result = await repoManager.createRepository({
        project: 'Test Project',
        name: 'New Repo'
      });

      expect(result).toEqual(mockRepo);
      expect(mockGitApi.createRepository).toHaveBeenCalledWith({
        name: 'New Repo',
        project: { name: 'Test Project' }
      });
    });
  });

  describe('getBranches', () => {
    it('should get repository branches', async () => {
      const mockRepos = [{
        id: '1',
        name: 'Test Repo'
      }];
      const mockBranches = [
        { name: 'main' },
        { name: 'develop' }
      ];

      mockGitApi.getRepositories.mockResolvedValue(mockRepos);
      mockGitApi.getBranches.mockResolvedValue(mockBranches);

      const result = await repoManager.getBranches({
        project: 'Test Project',
        repository: 'Test Repo'
      });

      expect(result).toEqual(['main', 'develop']);
      expect(mockGitApi.getBranches).toHaveBeenCalledWith('1');
    });
  });
});