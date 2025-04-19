import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../common/logger/logger.service';
import * as child_process from 'child_process';
import * as util from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const exec = util.promisify(child_process.exec);
const exists = util.promisify(fs.exists);
const readdir = util.promisify(fs.readdir);

export interface McpServerProcess {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'error';
  pid?: number;
  startTime?: Date;
  lastError?: string;
  serverType: string;
  serverPath: string;
}

@Injectable()
export class McpServersService {
  private servers: Map<string, McpServerProcess> = new Map();
  private serverProcesses: Map<string, child_process.ChildProcess> = new Map();
  private readonly serverBasePath: string;

  constructor(private readonly logger: LoggerService) {
    this.logger.setContext('McpServersService');
    this.serverBasePath = path.join(process.cwd(), 'src', 'modules', 'mcp-servers', 'src');
  }

  /**
   * List all available MCP server types
   */
  async listAvailableServerTypes(): Promise<string[]> {
    try {
      this.logger.debug('Listing available MCP server types');
      const dirs = await readdir(this.serverBasePath);
      return dirs.filter(async (dir) => {
        const stats = fs.statSync(path.join(this.serverBasePath, dir));
        return stats.isDirectory();
      });
    } catch (error) {
      this.logger.error(`Error listing server types: ${error.message}`, error);
      throw new Error(`Failed to list server types: ${error.message}`);
    }
  }

  /**
   * Get details for a specific server type
   */
  async getServerTypeDetails(serverType: string): Promise<any> {
    try {
      this.logger.debug(`Getting details for server type: ${serverType}`);
      const serverPath = path.join(this.serverBasePath, serverType);
      
      if (!await exists(serverPath)) {
        throw new Error(`Server type '${serverType}' not found`);
      }
      
      // Try to read package.json for server details
      const packageJsonPath = path.join(serverPath, 'package.json');
      if (await exists(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        return {
          name: packageJson.name || serverType,
          version: packageJson.version || 'unknown',
          description: packageJson.description || '',
          dependencies: packageJson.dependencies || {},
          scripts: packageJson.scripts || {}
        };
      }
      
      // If no package.json, return basic info
      return {
        name: serverType,
        version: 'unknown',
        description: 'No package.json found'
      };
    } catch (error) {
      this.logger.error(`Error getting server type details: ${error.message}`, error);
      throw new Error(`Failed to get server details: ${error.message}`);
    }
  }

  /**
   * Start an MCP server
   */
  async startServer(serverType: string, serverName: string, env?: Record<string, string>): Promise<McpServerProcess> {
    try {
      this.logger.debug(`Starting MCP server: ${serverName} (${serverType})`);
      const serverPath = path.join(this.serverBasePath, serverType);
      
      if (!await exists(serverPath)) {
        throw new Error(`Server type '${serverType}' not found`);
      }
      
      // Generate unique ID for this server instance
      const serverId = uuidv4();
      
      // Create environment variables for the server process
      const serverEnv = {
        ...process.env,
        ...env,
        MCP_SERVER_ID: serverId,
        MCP_SERVER_NAME: serverName
      };
      
      // Determine how to start the server (based on package.json or fallback to defaults)
      let startCommand = 'node index.js';
      
      const packageJsonPath = path.join(serverPath, 'package.json');
      if (await exists(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.scripts && packageJson.scripts.start) {
          startCommand = 'npm run start';
        }
      }
      
      // Start the server process
      const serverProcess = child_process.spawn(startCommand, [], {
        cwd: serverPath,
        env: serverEnv,
        shell: true
      });
      
      // Create server record
      const server: McpServerProcess = {
        id: serverId,
        name: serverName,
        status: 'running',
        pid: serverProcess.pid,
        startTime: new Date(),
        serverType,
        serverPath
      };
      
      // Store server and process
      this.servers.set(serverId, server);
      this.serverProcesses.set(serverId, serverProcess);
      
      // Handle process events
      serverProcess.on('error', (error) => {
        this.logger.error(`Server ${serverName} error: ${error.message}`);
        const serverRecord = this.servers.get(serverId);
        if (serverRecord) {
          serverRecord.status = 'error';
          serverRecord.lastError = error.message;
        }
      });
      
      serverProcess.on('exit', (code, signal) => {
        this.logger.warn(`Server ${serverName} exited with code ${code}, signal: ${signal}`);
        const serverRecord = this.servers.get(serverId);
        if (serverRecord) {
          serverRecord.status = 'stopped';
          serverRecord.lastError = code ? `Exited with code ${code}` : undefined;
        }
        this.serverProcesses.delete(serverId);
      });
      
      return server;
    } catch (error) {
      this.logger.error(`Error starting server: ${error.message}`, error);
      throw new Error(`Failed to start server: ${error.message}`);
    }
  }

  /**
   * Stop a running MCP server
   */
  async stopServer(serverId: string): Promise<boolean> {
    try {
      this.logger.debug(`Stopping MCP server: ${serverId}`);
      const server = this.servers.get(serverId);
      if (!server) {
        throw new Error(`Server ${serverId} not found`);
      }
      
      const process = this.serverProcesses.get(serverId);
      if (!process) {
        throw new Error(`Server process ${serverId} not found`);
      }
      
      // Try to gracefully terminate the process
      process.kill('SIGTERM');
      
      // Wait for process to terminate
      const terminationPromise = new Promise<boolean>((resolve) => {
        // Set timeout for graceful termination
        const terminationTimeout = setTimeout(() => {
          // Force kill if it doesn't terminate gracefully
          if (this.serverProcesses.has(serverId)) {
            this.logger.warn(`Forcing termination of server ${serverId}`);
            process.kill('SIGKILL');
          }
          resolve(true);
        }, 5000);
        
        // Listen for exit event
        process.on('exit', () => {
          clearTimeout(terminationTimeout);
          resolve(true);
        });
      });
      
      const terminated = await terminationPromise;
      
      // Update server record
      if (server) {
        server.status = 'stopped';
      }
      
      // Remove from processes map
      this.serverProcesses.delete(serverId);
      
      return terminated;
    } catch (error) {
      this.logger.error(`Error stopping server: ${error.message}`, error);
      throw new Error(`Failed to stop server: ${error.message}`);
    }
  }

  /**
   * Get all running MCP servers
   */
  getRunningServers(): McpServerProcess[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get details for a specific MCP server
   */
  getServerById(serverId: string): McpServerProcess | undefined {
    return this.servers.get(serverId);
  }

  /**
   * Install dependencies for a server type
   */
  async installServerDependencies(serverType: string): Promise<string> {
    try {
      this.logger.debug(`Installing dependencies for server type: ${serverType}`);
      const serverPath = path.join(this.serverBasePath, serverType);
      
      if (!await exists(serverPath)) {
        throw new Error(`Server type '${serverType}' not found`);
      }
      
      // Run npm install
      const { stdout, stderr } = await exec('npm install', { cwd: serverPath });
      
      return stdout;
    } catch (error) {
      this.logger.error(`Error installing dependencies: ${error.message}`, error);
      throw new Error(`Failed to install dependencies: ${error.message}`);
    }
  }
}