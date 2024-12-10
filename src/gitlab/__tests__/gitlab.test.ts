import { GitLabServer } from '../index';
import express from 'express';
import { Gitlab } from '@gitbeaker/node';

jest.mock('@gitbeaker/node');

describe('GitLabServer', () => {
  let server: GitLabServer;
  let app: express.Express;
  let mockGitlab: jest.Mocked<Gitlab>;

  beforeEach(() => {
    mockGitlab = new Gitlab({ token: 'test' }) as jest.Mocked<Gitlab>;
    (Gitlab as jest.Mock).mockImplementation(() => mockGitlab);
    server = new GitLabServer('test-token', 'test-project');
    app = express();
  });

  describe('handleFileUpload', () => {
    it('should create a new file if it does not exist', async () => {
      const req = {
        body: {
          path: 'test.txt',
          content: 'test content',
          message: 'test message',
        },
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      mockGitlab.RepositoryFiles.show.mockRejectedValueOnce({
        response: { status: 404 },
      });
      mockGitlab.RepositoryFiles.create.mockResolvedValueOnce({});

      await server.setupRoutes(app);
      await app._router.handle(req, res);

      expect(mockGitlab.RepositoryFiles.create).toHaveBeenCalledWith(
        'test-project',
        'test.txt',
        'main',
        'test content',
        'test message'
      );
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('should update an existing file', async () => {
      const req = {
        body: {
          path: 'test.txt',
          content: 'updated content',
          message: 'update message',
        },
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      mockGitlab.RepositoryFiles.show.mockResolvedValueOnce({});
      mockGitlab.RepositoryFiles.edit.mockResolvedValueOnce({});

      await server.setupRoutes(app);
      await app._router.handle(req, res);

      expect(mockGitlab.RepositoryFiles.edit).toHaveBeenCalledWith(
        'test-project',
        'test.txt',
        'main',
        'updated content',
        'update message'
      );
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('handleFileList', () => {
    it('should list files in directory', async () => {
      const req = {
        query: { path: 'test-dir' },
      };
      const res = {
        json: jest.fn(),
      };

      const mockFiles = [{ name: 'test.txt', type: 'blob' }];
      mockGitlab.Repositories.tree.mockResolvedValueOnce(mockFiles);

      await server.setupRoutes(app);
      await app._router.handle(req, res);

      expect(mockGitlab.Repositories.tree).toHaveBeenCalledWith('test-project', {
        path: 'test-dir',
        ref: 'main',
        recursive: true,
      });
      expect(res.json).toHaveBeenCalledWith(mockFiles);
    });
  });

  describe('handleFileDownload', () => {
    it('should download file content', async () => {
      const req = {
        params: { path: 'test.txt' },
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      const mockContent = Buffer.from('test content').toString('base64');
      mockGitlab.RepositoryFiles.show.mockResolvedValueOnce({
        content: mockContent,
      });

      await server.setupRoutes(app);
      await app._router.handle(req, res);

      expect(mockGitlab.RepositoryFiles.show).toHaveBeenCalledWith(
        'test-project',
        'test.txt',
        'main'
      );
      expect(res.json).toHaveBeenCalledWith({
        content: 'test content',
      });
    });
  });

  describe('handleFileDelete', () => {
    it('should delete file', async () => {
      const req = {
        params: { path: 'test.txt' },
        body: { message: 'delete message' },
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      mockGitlab.RepositoryFiles.remove.mockResolvedValueOnce({});

      await server.setupRoutes(app);
      await app._router.handle(req, res);

      expect(mockGitlab.RepositoryFiles.remove).toHaveBeenCalledWith(
        'test-project',
        'test.txt',
        'main',
        'delete message'
      );
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });
});