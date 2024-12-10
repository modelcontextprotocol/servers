import { Express } from 'express';
import { Gitlab } from '@gitbeaker/node';
import { ServerInterface } from '../types';
import { handleErrors } from '../utils/error';

export class GitLabServer implements ServerInterface {
  private gitlab: InstanceType<typeof Gitlab>;
  private projectId: string;

  constructor(token: string, projectId: string) {
    this.gitlab = new Gitlab({
      token,
    });
    this.projectId = projectId;
  }

  async setupRoutes(app: Express): Promise<void> {
    app.post('/gitlab/files', handleErrors(this.handleFileUpload.bind(this)));
    app.get('/gitlab/files', handleErrors(this.handleFileList.bind(this)));
    app.get('/gitlab/files/:path(*)', handleErrors(this.handleFileDownload.bind(this)));
    app.delete('/gitlab/files/:path(*)', handleErrors(this.handleFileDelete.bind(this)));
  }

  private async handleFileUpload(req: any, res: any) {
    const { path, content, message = 'Upload file' } = req.body;

    if (!path || !content) {
      res.status(400).json({ error: 'Path and content are required' });
      return;
    }

    try {
      const existingFile = await this.gitlab.RepositoryFiles.show(this.projectId, path, 'main');
      if (existingFile) {
        await this.gitlab.RepositoryFiles.edit(
          this.projectId,
          path,
          'main',
          content,
          message
        );
      } else {
        await this.gitlab.RepositoryFiles.create(
          this.projectId,
          path,
          'main',
          content,
          message
        );
      }
      res.json({ success: true });
    } catch (error) {
      if (error.response?.status === 404) {
        await this.gitlab.RepositoryFiles.create(
          this.projectId,
          path,
          'main',
          content,
          message
        );
        res.json({ success: true });
      } else {
        throw error;
      }
    }
  }

  private async handleFileList(req: any, res: any) {
    const path = req.query.path || '';
    const files = await this.gitlab.Repositories.tree(this.projectId, {
      path,
      ref: 'main',
      recursive: true,
    });
    res.json(files);
  }

  private async handleFileDownload(req: any, res: any) {
    const { path } = req.params;
    try {
      const file = await this.gitlab.RepositoryFiles.show(
        this.projectId,
        path,
        'main'
      );
      const content = Buffer.from(file.content, 'base64').toString('utf-8');
      res.json({ content });
    } catch (error) {
      if (error.response?.status === 404) {
        res.status(404).json({ error: 'File not found' });
      } else {
        throw error;
      }
    }
  }

  private async handleFileDelete(req: any, res: any) {
    const { path } = req.params;
    const { message = 'Delete file' } = req.body;

    try {
      await this.gitlab.RepositoryFiles.remove(
        this.projectId,
        path,
        'main',
        message
      );
      res.json({ success: true });
    } catch (error) {
      if (error.response?.status === 404) {
        res.status(404).json({ error: 'File not found' });
      } else {
        throw error;
      }
    }
  }
}