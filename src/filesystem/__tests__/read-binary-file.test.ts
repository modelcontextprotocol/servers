import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * Integration tests for read_binary_file tool.
 * Tests that binary files (Excel, PDF, images, etc.) can be read and returned as embedded resources.
 */
describe('read_binary_file tool', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let testDir: string;

  beforeEach(async () => {
    // Create a temp directory for testing
    // Use realpath to resolve symlinks (e.g., /var -> /private/var on macOS)
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-fs-binary-test-'));
    testDir = await fs.realpath(tempDir);

    // Create a minimal valid .xlsx file (ZIP format with PK header)
    const xlsxPath = path.join(testDir, 'test.xlsx');
    const minimalXlsx = Buffer.from([
      0x50, 0x4B, 0x03, 0x04, // ZIP local file header signature
      0x14, 0x00, 0x00, 0x00, 0x08, 0x00, // version, flags, compression
      0x00, 0x00, 0x00, 0x00, // time, date
      0x00, 0x00, 0x00, 0x00, // CRC-32
      0x00, 0x00, 0x00, 0x00, // compressed size
      0x00, 0x00, 0x00, 0x00, // uncompressed size
      0x00, 0x00, // filename length
      0x00, 0x00, // extra field length
    ]);
    await fs.writeFile(xlsxPath, minimalXlsx);

    // Create a minimal .xls file (OLE2 format)
    const xlsPath = path.join(testDir, 'test.xls');
    const minimalXls = Buffer.from([
      0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, // OLE2 signature
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    await fs.writeFile(xlsPath, minimalXls);

    // Create a simple PNG file (1x1 red pixel)
    const pngPath = path.join(testDir, 'test.png');
    const pngData = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
      0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
      0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
      0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    await fs.writeFile(pngPath, pngData);

    // Create a PDF file
    const pdfPath = path.join(testDir, 'test.pdf');
    const minimalPdf = Buffer.from('%PDF-1.4\n%EOF\n');
    await fs.writeFile(pdfPath, minimalPdf);

    // Start the MCP server
    const serverPath = path.resolve(__dirname, '../dist/index.js');
    transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath, testDir],
    });

    client = new Client({
      name: 'test-client',
      version: '1.0.0',
    }, {
      capabilities: {}
    });

    await client.connect(transport);
  });

  afterEach(async () => {
    await client?.close();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should read .xlsx file and return as embedded resource', async () => {
    const xlsxPath = path.join(testDir, 'test.xlsx');
    
    const result = await client.callTool({
      name: 'read_binary_file',
      arguments: { path: xlsxPath }
    });

    // Check that we got content back
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    const content = result.content as Array<any>;
    expect(content.length).toBeGreaterThan(0);

    // Check the content structure - should be a resource
    const contentItem = content[0];
    expect(contentItem.type).toBe('resource');
    expect(contentItem.resource).toBeDefined();
    
    // Check resource properties
    const resource = contentItem.resource;
    expect(resource.uri).toBeDefined();
    expect(resource.uri).toContain(xlsxPath);
    expect(resource.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(resource.blob).toBeDefined();

    // Blob should be valid base64
    expect(typeof resource.blob).toBe('string');
    expect(resource.blob.length).toBeGreaterThan(0);
    expect(/^[A-Za-z0-9+/]*={0,2}$/.test(resource.blob)).toBe(true);

    // Verify we can decode the base64 back to original
    const decoded = Buffer.from(resource.blob, 'base64');
    const original = await fs.readFile(xlsxPath);
    expect(decoded.equals(original)).toBe(true);
  });

  it('should read .xls file and return as embedded resource', async () => {
    const xlsPath = path.join(testDir, 'test.xls');
    
    const result = await client.callTool({
      name: 'read_binary_file',
      arguments: { path: xlsPath }
    });

    const content = result.content as Array<any>;
    const contentItem = content[0];
    
    expect(contentItem.type).toBe('resource');
    expect(contentItem.resource.mimeType).toBe('application/vnd.ms-excel');
    expect(contentItem.resource.blob).toBeDefined();

    // Verify data integrity
    const decoded = Buffer.from(contentItem.resource.blob, 'base64');
    const original = await fs.readFile(xlsPath);
    expect(decoded.equals(original)).toBe(true);
  });

  it('should read PNG file and return as embedded resource', async () => {
    const pngPath = path.join(testDir, 'test.png');
    
    const result = await client.callTool({
      name: 'read_binary_file',
      arguments: { path: pngPath }
    });

    const content = result.content as Array<any>;
    const contentItem = content[0];
    
    expect(contentItem.type).toBe('resource');
    expect(contentItem.resource.mimeType).toBe('image/png');
    expect(contentItem.resource.blob).toBeDefined();

    // Verify data integrity
    const decoded = Buffer.from(contentItem.resource.blob, 'base64');
    const original = await fs.readFile(pngPath);
    expect(decoded.equals(original)).toBe(true);
  });

  it('should read PDF file and return as embedded resource', async () => {
    const pdfPath = path.join(testDir, 'test.pdf');
    
    const result = await client.callTool({
      name: 'read_binary_file',
      arguments: { path: pdfPath }
    });

    const content = result.content as Array<any>;
    const contentItem = content[0];
    
    expect(contentItem.type).toBe('resource');
    expect(contentItem.resource.mimeType).toBe('application/pdf');
    expect(contentItem.resource.blob).toBeDefined();

    // Verify data integrity
    const decoded = Buffer.from(contentItem.resource.blob, 'base64');
    const original = await fs.readFile(pdfPath);
    expect(decoded.equals(original)).toBe(true);
  });

  it('should handle large files efficiently', async () => {
    // Create a larger file (100KB)
    const largePath = path.join(testDir, 'large.xlsx');
    const largeData = Buffer.alloc(100 * 1024);
    // Add ZIP header to make it look like a valid xlsx
    largeData.write('PK\x03\x04', 0);
    await fs.writeFile(largePath, largeData);

    const startTime = Date.now();
    const result = await client.callTool({
      name: 'read_binary_file',
      arguments: { path: largePath }
    });
    const endTime = Date.now();

    // Should complete in reasonable time
    expect(endTime - startTime).toBeLessThan(2000);

    // Verify the data
    const content = result.content as Array<any>;
    const contentItem = content[0];
    expect(contentItem.type).toBe('resource');
    
    const decoded = Buffer.from(contentItem.resource.blob, 'base64');
    expect(decoded.length).toBe(100 * 1024);
  });

  it('should handle unknown file extensions with generic MIME type', async () => {
    const unknownPath = path.join(testDir, 'test.xyz');
    await fs.writeFile(unknownPath, Buffer.from('test data'));

    const result = await client.callTool({
      name: 'read_binary_file',
      arguments: { path: unknownPath }
    });

    const content = result.content as Array<any>;
    const contentItem = content[0];
    
    expect(contentItem.type).toBe('resource');
    expect(contentItem.resource.mimeType).toBe('application/octet-stream');
    expect(contentItem.resource.blob).toBeDefined();
  });
});

// Made with Bob
