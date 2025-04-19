import { IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartServerDto {
  @ApiProperty({
    description: 'The type of MCP server to start',
    example: 'fetch',
  })
  @IsNotEmpty()
  @IsString()
  serverType: string;

  @ApiProperty({
    description: 'A name for this server instance',
    example: 'fetch-server-1',
  })
  @IsNotEmpty()
  @IsString()
  serverName: string;

  @ApiPropertyOptional({
    description: 'Environment variables for the server process',
    example: { 'API_KEY': 'your-api-key', 'DEBUG': 'true' },
    type: 'object',
  })
  @IsOptional()
  @IsObject()
  env?: Record<string, string>;
}