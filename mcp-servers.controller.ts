import { Controller, Get, Post, Body, Param, Delete, ValidationPipe } from '@nestjs/common';
import { McpServersService, McpServerProcess } from './mcp-servers.service';
import { StartServerDto } from './dto/start-server.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { LoggerService } from '../../common/logger/logger.service';

@ApiTags('mcp-servers')
@Controller('mcp-servers')
export class McpServersController {
  constructor(
    private readonly mcpServersService: McpServersService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('McpServersController');
  }

  @Get('types')
  @ApiOperation({ summary: 'List all available MCP server types' })
  @ApiResponse({ status: 200, description: 'Server types retrieved successfully' })
  @ApiResponse({ status: 500, description: 'Server error' })
  async listServerTypes() {
    this.logger.debug('Received request to list server types');
    const serverTypes = await this.mcpServersService.listAvailableServerTypes();
    return { serverTypes };
  }

  @Get('types/:type')
  @ApiOperation({ summary: 'Get details for a specific server type' })
  @ApiParam({ name: 'type', description: 'The server type to get details for' })
  @ApiResponse({ status: 200, description: 'Server type details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Server type not found' })
  @ApiResponse({ status: 500, description: 'Server error' })
  async getServerTypeDetails(@Param('type') type: string) {
    this.logger.debug(`Received request to get details for server type: ${type}`);
    const details = await this.mcpServersService.getServerTypeDetails(type);
    return { details };
  }

  @Post('start')
  @ApiOperation({ summary: 'Start a new MCP server instance' })
  @ApiResponse({ status: 201, description: 'Server started successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Server type not found' })
  @ApiResponse({ status: 500, description: 'Server error' })
  async startServer(@Body(ValidationPipe) startServerDto: StartServerDto) {
    this.logger.debug(`Received request to start server: ${startServerDto.serverName} (${startServerDto.serverType})`);
    const server = await this.mcpServersService.startServer(
      startServerDto.serverType,
      startServerDto.serverName,
      startServerDto.env
    );
    return { server };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Stop a running MCP server' })
  @ApiParam({ name: 'id', description: 'The ID of the server to stop' })
  @ApiResponse({ status: 200, description: 'Server stopped successfully' })
  @ApiResponse({ status: 404, description: 'Server not found' })
  @ApiResponse({ status: 500, description: 'Server error' })
  async stopServer(@Param('id') id: string) {
    this.logger.debug(`Received request to stop server: ${id}`);
    const result = await this.mcpServersService.stopServer(id);
    return { success: result };
  }

  @Get()
  @ApiOperation({ summary: 'List all running MCP servers' })
  @ApiResponse({ status: 200, description: 'Server list retrieved successfully' })
  @ApiResponse({ status: 500, description: 'Server error' })
  getRunningServers() {
    this.logger.debug('Received request to list running servers');
    const servers = this.mcpServersService.getRunningServers();
    return { servers };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details for a specific MCP server' })
  @ApiParam({ name: 'id', description: 'The ID of the server to get details for' })
  @ApiResponse({ status: 200, description: 'Server details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Server not found' })
  getServerById(@Param('id') id: string) {
    this.logger.debug(`Received request to get server details: ${id}`);
    const server = this.mcpServersService.getServerById(id);
    
    if (!server) {
      return { error: 'Server not found', status: 404 };
    }
    
    return { server };
  }

  @Post('types/:type/install')
  @ApiOperation({ summary: 'Install dependencies for a server type' })
  @ApiParam({ name: 'type', description: 'The server type to install dependencies for' })
  @ApiResponse({ status: 200, description: 'Dependencies installed successfully' })
  @ApiResponse({ status: 404, description: 'Server type not found' })
  @ApiResponse({ status: 500, description: 'Server error' })
  async installServerDependencies(@Param('type') type: string) {
    this.logger.debug(`Received request to install dependencies for server type: ${type}`);
    const output = await this.mcpServersService.installServerDependencies(type);
    return { success: true, output };
  }
}