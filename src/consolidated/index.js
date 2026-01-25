import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import os from 'os';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { randomBytes } from 'crypto';
import { createTwoFilesPatch } from 'diff';
import { minimatch } from 'minimatch';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
// --- Path Utilities ---
function convertToWindowsPath(p) {
    if (p.startsWith('/mnt/'))
        return p;
    if (p.match(/^\/[a-zA-Z]\//) && process.platform === 'win32') {
        const driveLetter = p.charAt(1).toUpperCase();
        const pathPart = p.slice(2).replace(/\//g, '\\');
        return `${driveLetter}:${pathPart}`;
    }
    if (p.match(/^[a-zA-Z]:/))
        return p.replace(/\//g, '\\');
    return p;
}
function normalizePath(p) {
    p = p.trim().replace(/^["']|["']$/g, '');
    const isUnixPath = p.startsWith('/') && (p.match(/^\/mnt\/[a-z]\//i) ||
        (process.platform !== 'win32') ||
        (process.platform === 'win32' && !p.match(/^\/[a-zA-Z]\//)));
    if (isUnixPath)
        return p.replace(/\/+/g, '/').replace(/(?<!^)\/$/, '');
    p = convertToWindowsPath(p);
    if (p.startsWith('\\\\')) {
        let uncPath = p.replace(/^\\{2,}/, '\\\\');
        const restOfPath = uncPath.substring(2).replace(/\\\\/g, '\\');
        p = '\\\\' + restOfPath;
    }
    else {
        p = p.replace(/\\\\/g, '\\');
    }
    let normalized = path.normalize(p);
    if (p.startsWith('\\\\') && !normalized.startsWith('\\\\'))
        normalized = '\\' + normalized;
    if (normalized.match(/^[a-zA-Z]:/)) {
        let result = normalized.replace(/\//g, '\\');
        if (/^[a-z]:/.test(result))
            result = result.charAt(0).toUpperCase() + result.slice(1);
        return result;
    }
    if (process.platform === 'win32')
        return normalized.replace(/\//g, '\\');
    return normalized;
}
function expandHome(filepath) {
    if (filepath.startsWith('~/') || filepath === '~')
        return path.join(os.homedir(), filepath.slice(1));
    return filepath;
}
function isPathWithinAllowedDirectories(absolutePath, allowedDirectories) {
    if (typeof absolutePath !== 'string' || !Array.isArray(allowedDirectories))
        return false;
    if (!absolutePath || allowedDirectories.length === 0)
        return false;
    if (absolutePath.includes('\x00'))
        return false;
    let normalizedPath;
    try {
        normalizedPath = path.resolve(path.normalize(absolutePath));
    }
    catch {
        return false;
    }
    if (!path.isAbsolute(normalizedPath))
        throw new Error('Path must be absolute after normalization');
    return allowedDirectories.some(dir => {
        if (typeof dir !== 'string' || !dir)
            return false;
        if (dir.includes('\x00'))
            return false;
        let normalizedDir;
        try {
            normalizedDir = path.resolve(path.normalize(dir));
        }
        catch {
            return false;
        }
        if (!path.isAbsolute(normalizedDir))
            throw new Error('Allowed directories must be absolute paths after normalization');
        if (normalizedPath === normalizedDir)
            return true;
        if (normalizedDir === path.sep)
            return normalizedPath.startsWith(path.sep);
        if (path.sep === '\\' && normalizedDir.match(/^[A-Za-z]:\\?$/)) {
            const dirDrive = normalizedDir.charAt(0).toLowerCase();
            const pathDrive = normalizedPath.charAt(0).toLowerCase();
            return pathDrive === dirDrive && normalizedPath.startsWith(normalizedDir.replace(/\\?$/, '\\'));
        }
        return normalizedPath.startsWith(normalizedDir + path.sep);
    });
}
class KnowledgeGraphManager {
    memoryFilePath;
    constructor(memoryFilePath) {
        this.memoryFilePath = memoryFilePath;
    }
    async loadGraph() {
        try {
            const data = await fs.readFile(this.memoryFilePath, "utf-8");
            const lines = data.split("\n").filter(line => line.trim() !== "");
            return lines.reduce((graph, line) => {
                const item = JSON.parse(line);
                if (item.type === "entity") {
                    graph.entities.push({
                        name: item.name,
                        entityType: item.entityType,
                        observations: item.observations
                    });
                }
                if (item.type === "relation") {
                    graph.relations.push({
                        from: item.from,
                        to: item.to,
                        relationType: item.relationType
                    });
                }
                return graph;
            }, { entities: [], relations: [] });
        }
        catch (error) {
            if (error instanceof Error && error.code === "ENOENT") {
                return { entities: [], relations: [] };
            }
            throw error;
        }
    }
    async saveGraph(graph) {
        const lines = [
            ...graph.entities.map(e => JSON.stringify({
                type: "entity",
                name: e.name,
                entityType: e.entityType,
                observations: e.observations
            })),
            ...graph.relations.map(r => JSON.stringify({
                type: "relation",
                from: r.from,
                to: r.to,
                relationType: r.relationType
            })),
        ];
        await fs.writeFile(this.memoryFilePath, lines.join("\n"));
    }
    async createEntities(entities) {
        const graph = await this.loadGraph();
        const newEntities = entities.filter(e => !graph.entities.some(existingEntity => existingEntity.name === e.name));
        graph.entities.push(...newEntities);
        await this.saveGraph(graph);
        return newEntities;
    }
    async createRelations(relations) {
        const graph = await this.loadGraph();
        const newRelations = relations.filter(r => !graph.relations.some(existingRelation => existingRelation.from === r.from &&
            existingRelation.to === r.to &&
            existingRelation.relationType === r.relationType));
        graph.relations.push(...newRelations);
        await this.saveGraph(graph);
        return newRelations;
    }
    async addObservations(observations) {
        const graph = await this.loadGraph();
        const results = observations.map(o => {
            const entity = graph.entities.find(e => e.name === o.entityName);
            if (!entity) {
                throw new Error(`Entity with name ${o.entityName} not found`);
            }
            const newObservations = o.contents.filter(content => !entity.observations.includes(content));
            entity.observations.push(...newObservations);
            return { entityName: o.entityName, addedObservations: newObservations };
        });
        await this.saveGraph(graph);
        return results;
    }
    async deleteEntities(entityNames) {
        const graph = await this.loadGraph();
        graph.entities = graph.entities.filter(e => !entityNames.includes(e.name));
        graph.relations = graph.relations.filter(r => !entityNames.includes(r.from) && !entityNames.includes(r.to));
        await this.saveGraph(graph);
    }
    async deleteObservations(deletions) {
        const graph = await this.loadGraph();
        deletions.forEach(d => {
            const entity = graph.entities.find(e => e.name === d.entityName);
            if (entity) {
                entity.observations = entity.observations.filter(o => !d.observations.includes(o));
            }
        });
        await this.saveGraph(graph);
    }
    async deleteRelations(relations) {
        const graph = await this.loadGraph();
        graph.relations = graph.relations.filter(r => !relations.some(delRelation => r.from === delRelation.from &&
            r.to === delRelation.to &&
            r.relationType === delRelation.relationType));
        await this.saveGraph(graph);
    }
    async readGraph() {
        return this.loadGraph();
    }
    async searchNodes(query) {
        const graph = await this.loadGraph();
        const filteredEntities = graph.entities.filter(e => e.name.toLowerCase().includes(query.toLowerCase()) ||
            e.entityType.toLowerCase().includes(query.toLowerCase()) ||
            e.observations.some(o => o.toLowerCase().includes(query.toLowerCase())));
        const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
        const filteredRelations = graph.relations.filter(r => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to));
        return { entities: filteredEntities, relations: filteredRelations };
    }
    async openNodes(names) {
        const graph = await this.loadGraph();
        const filteredEntities = graph.entities.filter(e => names.includes(e.name));
        const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
        const filteredRelations = graph.relations.filter(r => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to));
        return { entities: filteredEntities, relations: filteredRelations };
    }
}
class SequentialThinkingServer {
    thoughtHistory = [];
    branches = {};
    disableThoughtLogging;
    constructor() {
        this.disableThoughtLogging = (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true";
    }
    formatThought(thoughtData) {
        const { thoughtNumber, totalThoughts, thought, isRevision, revisesThought, branchFromThought, branchId } = thoughtData;
        let prefix = '';
        let context = '';
        if (isRevision) {
            prefix = chalk.yellow('🔄 Revision');
            context = ` (revising thought ${revisesThought})`;
        }
        else if (branchFromThought) {
            prefix = chalk.green('🌿 Branch');
            context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
        }
        else {
            prefix = chalk.blue('💭 Thought');
            context = '';
        }
        const header = `${prefix} ${thoughtNumber}/${totalThoughts}${context}`;
        const border = '─'.repeat(Math.max(header.length, thought.length) + 4);
        return `\n┌${border}┐\n│ ${header} │\n├${border}┤\n│ ${thought.padEnd(border.length - 2)} │\n└${border}┘`;
    }
    processThought(input) {
        if (input.thoughtNumber > input.totalThoughts) {
            input.totalThoughts = input.thoughtNumber;
        }
        this.thoughtHistory.push(input);
        if (input.branchFromThought && input.branchId) {
            if (!this.branches[input.branchId]) {
                this.branches[input.branchId] = [];
            }
            this.branches[input.branchId].push(input);
        }
        if (!this.disableThoughtLogging) {
            console.error(this.formatThought(input));
        }
        return {
            thoughtNumber: input.thoughtNumber,
            totalThoughts: input.totalThoughts,
            nextThoughtNeeded: input.nextThoughtNeeded,
            branches: Object.keys(this.branches),
            thoughtHistoryLength: this.thoughtHistory.length
        };
    }
}
// --- Filesystem Logic ---
let allowedDirectories = [];
function setAllowedDirectories(directories) {
    allowedDirectories = [...directories];
}
async function validatePath(requestedPath) {
    const expandedPath = expandHome(requestedPath);
    const absolute = path.isAbsolute(expandedPath)
        ? path.resolve(expandedPath)
        : path.resolve(process.cwd(), expandedPath);
    const normalizedRequested = normalizePath(absolute);
    if (!isPathWithinAllowedDirectories(normalizedRequested, allowedDirectories)) {
        throw new Error(`Access denied - path outside allowed directories: ${absolute}`);
    }
    try {
        const realPath = await fs.realpath(absolute);
        const normalizedReal = normalizePath(realPath);
        if (!isPathWithinAllowedDirectories(normalizedReal, allowedDirectories)) {
            throw new Error(`Access denied - symlink target outside allowed directories: ${realPath}`);
        }
        return realPath;
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            const parentDir = path.dirname(absolute);
            try {
                const realParentPath = await fs.realpath(parentDir);
                const normalizedParent = normalizePath(realParentPath);
                if (!isPathWithinAllowedDirectories(normalizedParent, allowedDirectories)) {
                    throw new Error(`Access denied - parent directory outside allowed directories: ${realParentPath}`);
                }
                return absolute;
            }
            catch {
                throw new Error(`Parent directory does not exist: ${parentDir}`);
            }
        }
        throw error;
    }
}
async function readFileContent(filePath) {
    return await fs.readFile(filePath, 'utf-8');
}
async function writeFileContent(filePath, content) {
    try {
        await fs.writeFile(filePath, content, { encoding: "utf-8", flag: 'wx' });
    }
    catch (error) {
        if (error.code === 'EEXIST') {
            const tempPath = `${filePath}.${randomBytes(16).toString('hex')}.tmp`;
            try {
                await fs.writeFile(tempPath, content, 'utf-8');
                await fs.rename(tempPath, filePath);
            }
            catch (renameError) {
                try {
                    await fs.unlink(tempPath);
                }
                catch { }
                throw renameError;
            }
        }
        else {
            throw error;
        }
    }
}
async function tailFile(filePath, lines) {
    const content = await fs.readFile(filePath, 'utf-8');
    const allLines = content.split('\n');
    return allLines.slice(-lines).join('\n');
}
async function headFile(filePath, lines) {
    const content = await fs.readFile(filePath, 'utf-8');
    const allLines = content.split('\n');
    return allLines.slice(0, lines).join('\n');
}
async function applyFileEdits(filePath, edits, dryRun) {
    const content = await fs.readFile(filePath, 'utf-8');
    let newContent = content;
    for (const edit of edits) {
        if (!newContent.includes(edit.oldText)) {
            throw new Error(`Could not find exact match for edit: ${edit.oldText}`);
        }
        newContent = newContent.replace(edit.oldText, edit.newText);
    }
    const diff = createTwoFilesPatch(filePath, filePath, content, newContent);
    if (!dryRun) {
        await fs.writeFile(filePath, newContent, 'utf-8');
    }
    return diff;
}
async function readFileAsBase64Stream(filePath) {
    return new Promise((resolve, reject) => {
        const stream = createReadStream(filePath);
        const chunks = [];
        stream.on('data', (chunk) => {
            chunks.push(chunk);
        });
        stream.on('end', () => {
            const finalBuffer = Buffer.concat(chunks);
            resolve(finalBuffer.toString('base64'));
        });
        stream.on('error', (err) => reject(err));
    });
}
function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}
// --- Main Server Initialization ---
const server = new McpServer({
    name: "consolidated-mcp-server",
    version: "1.0.0",
});
// Initialize Managers
const memoryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'memory.jsonl');
const knowledgeGraphManager = new KnowledgeGraphManager(memoryPath);
const thinkingServer = new SequentialThinkingServer();
// Register Memory Tools
const EntitySchema = z.object({
    name: z.string().describe("The name of the entity"),
    entityType: z.string().describe("The type of the entity"),
    observations: z.array(z.string()).describe("An array of observation contents associated with the entity")
});
const RelationSchema = z.object({
    from: z.string().describe("The name of the entity where the relation starts"),
    to: z.string().describe("The name of the entity where the relation ends"),
    relationType: z.string().describe("The type of the relation")
});
server.registerTool("create_entities", { inputSchema: z.object({ entities: z.array(EntitySchema) }) }, async (args) => {
    const result = await knowledgeGraphManager.createEntities(args.entities);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.registerTool("create_relations", { inputSchema: z.object({ relations: z.array(RelationSchema) }) }, async (args) => {
    const result = await knowledgeGraphManager.createRelations(args.relations);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.registerTool("add_observations", {
    inputSchema: z.object({
        observations: z.array(z.object({
            entityName: z.string(),
            contents: z.array(z.string())
        }))
    })
}, async (args) => {
    const result = await knowledgeGraphManager.addObservations(args.observations);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.registerTool("delete_entities", { inputSchema: z.object({ entityNames: z.array(z.string()) }) }, async (args) => {
    await knowledgeGraphManager.deleteEntities(args.entityNames);
    return { content: [{ type: "text", text: "Entities deleted successfully" }] };
});
server.registerTool("delete_observations", {
    inputSchema: z.object({
        deletions: z.array(z.object({
            entityName: z.string(),
            observations: z.array(z.string())
        }))
    })
}, async (args) => {
    await knowledgeGraphManager.deleteObservations(args.deletions);
    return { content: [{ type: "text", text: "Observations deleted successfully" }] };
});
server.registerTool("delete_relations", { inputSchema: z.object({ relations: z.array(RelationSchema) }) }, async (args) => {
    await knowledgeGraphManager.deleteRelations(args.relations);
    return { content: [{ type: "text", text: "Relations deleted successfully" }] };
});
server.registerTool("read_graph", { inputSchema: z.object({}) }, async () => {
    const graph = await knowledgeGraphManager.readGraph();
    return { content: [{ type: "text", text: JSON.stringify(graph, null, 2) }] };
});
server.registerTool("search_nodes", { inputSchema: z.object({ query: z.string() }) }, async (args) => {
    const graph = await knowledgeGraphManager.searchNodes(args.query);
    return { content: [{ type: "text", text: JSON.stringify(graph, null, 2) }] };
});
server.registerTool("open_nodes", { inputSchema: z.object({ names: z.array(z.string()) }) }, async (args) => {
    const graph = await knowledgeGraphManager.openNodes(args.names);
    return { content: [{ type: "text", text: JSON.stringify(graph, null, 2) }] };
});
// Register Sequential Thinking Tool
server.registerTool("sequentialthinking", {
    inputSchema: z.object({
        thought: z.string(),
        nextThoughtNeeded: z.boolean(),
        thoughtNumber: z.number().int().min(1),
        totalThoughts: z.number().int().min(1),
        isRevision: z.boolean().optional(),
        revisesThought: z.number().int().min(1).optional(),
        branchFromThought: z.number().int().min(1).optional(),
        branchId: z.string().optional(),
        needsMoreThoughts: z.boolean().optional()
    })
}, async (args) => {
    const result = thinkingServer.processThought(args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
// Register Filesystem Tools
server.registerTool("read_text_file", {
    inputSchema: z.object({
        path: z.string(),
        tail: z.number().optional(),
        head: z.number().optional()
    })
}, async (args) => {
    const validPath = await validatePath(args.path);
    let content;
    if (args.tail) {
        content = await tailFile(validPath, args.tail);
    }
    else if (args.head) {
        content = await headFile(validPath, args.head);
    }
    else {
        content = await readFileContent(validPath);
    }
    return { content: [{ type: "text", text: content }] };
});
server.registerTool("read_media_file", { inputSchema: z.object({ path: z.string() }) }, async (args) => {
    const validPath = await validatePath(args.path);
    const extension = path.extname(validPath).toLowerCase();
    const mimeTypes = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
        ".webp": "image/webp", ".bmp": "image/bmp", ".svg": "image/svg+xml", ".mp3": "audio/mpeg",
        ".wav": "audio/wav", ".ogg": "audio/ogg", ".flac": "audio/flac",
    };
    const mimeType = mimeTypes[extension] || "application/octet-stream";
    const data = await readFileAsBase64Stream(validPath);
    return {
        content: [{
                type: mimeType.startsWith("image/") ? "image" : mimeType.startsWith("audio/") ? "audio" : "blob",
                data,
                mimeType
            }]
    };
});
server.registerTool("read_multiple_files", { inputSchema: z.object({ paths: z.array(z.string()) }) }, async (args) => {
    const results = await Promise.all(args.paths.map(async (p) => {
        try {
            const validPath = await validatePath(p);
            const content = await readFileContent(validPath);
            return `${p}:\n${content}\n`;
        }
        catch (e) {
            return `${p}: Error - ${e}\n`;
        }
    }));
    return { content: [{ type: "text", text: results.join("\n---\n") }] };
});
server.registerTool("write_file", { inputSchema: z.object({ path: z.string(), content: z.string() }) }, async (args) => {
    const validPath = await validatePath(args.path);
    await writeFileContent(validPath, args.content);
    return { content: [{ type: "text", text: `Successfully wrote to ${args.path}` }] };
});
server.registerTool("edit_file", {
    inputSchema: z.object({
        path: z.string(),
        edits: z.array(z.object({ oldText: z.string(), newText: z.string() })),
        dryRun: z.boolean().default(false)
    })
}, async (args) => {
    const validPath = await validatePath(args.path);
    const diff = await applyFileEdits(validPath, args.edits, args.dryRun);
    return { content: [{ type: "text", text: diff }] };
});
server.registerTool("create_directory", { inputSchema: z.object({ path: z.string() }) }, async (args) => {
    const validPath = await validatePath(args.path);
    await fs.mkdir(validPath, { recursive: true });
    return { content: [{ type: "text", text: `Successfully created directory ${args.path}` }] };
});
server.registerTool("list_directory", { inputSchema: z.object({ path: z.string() }) }, async (args) => {
    const validPath = await validatePath(args.path);
    const entries = await fs.readdir(validPath, { withFileTypes: true });
    const formatted = entries
        .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
        .join("\n");
    return { content: [{ type: "text", text: formatted }] };
});
server.registerTool("list_directory_with_sizes", {
    inputSchema: z.object({
        path: z.string(),
        sortBy: z.enum(['name', 'size']).optional().default('name')
    })
}, async (args) => {
    const validPath = await validatePath(args.path);
    const entries = await fs.readdir(validPath, { withFileTypes: true });
    const detailed = await Promise.all(entries.map(async (e) => {
        const stats = await fs.stat(path.join(validPath, e.name));
        return { name: e.name, isDir: e.isDirectory(), size: stats.size };
    }));
    if (args.sortBy === 'size')
        detailed.sort((a, b) => b.size - a.size);
    else
        detailed.sort((a, b) => a.name.localeCompare(b.name));
    const formatted = detailed.map(e => `${e.isDir ? "[DIR]" : "[FILE]"} ${e.name.padEnd(30)} ${e.isDir ? "" : formatSize(e.size).padStart(10)}`).join("\n");
    return { content: [{ type: "text", text: formatted }] };
});
server.registerTool("directory_tree", {
    inputSchema: z.object({
        path: z.string(),
        excludePatterns: z.array(z.string()).optional().default([])
    })
}, async (args) => {
    const rootPath = await validatePath(args.path);
    async function buildTree(currentPath) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        const result = [];
        for (const entry of entries) {
            const relPath = path.relative(rootPath, path.join(currentPath, entry.name));
            if (args.excludePatterns.some((p) => minimatch(relPath, p)))
                continue;
            const node = { name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' };
            if (entry.isDirectory())
                node.children = await buildTree(path.join(currentPath, entry.name));
            result.push(node);
        }
        return result;
    }
    const tree = await buildTree(rootPath);
    return { content: [{ type: "text", text: JSON.stringify(tree, null, 2) }] };
});
server.registerTool("move_file", { inputSchema: z.object({ source: z.string(), destination: z.string() }) }, async (args) => {
    const validSource = await validatePath(args.source);
    const validDest = await validatePath(args.destination);
    await fs.rename(validSource, validDest);
    return { content: [{ type: "text", text: `Successfully moved ${args.source} to ${args.destination}` }] };
});
server.registerTool("search_files", {
    inputSchema: z.object({
        path: z.string(),
        pattern: z.string(),
        excludePatterns: z.array(z.string()).optional().default([])
    })
}, async (args) => {
    const rootPath = await validatePath(args.path);
    const results = [];
    async function search(currentPath) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            const relPath = path.relative(rootPath, fullPath);
            if (args.excludePatterns.some((p) => minimatch(relPath, p)))
                continue;
            if (minimatch(relPath, args.pattern))
                results.push(fullPath);
            if (entry.isDirectory())
                await search(fullPath);
        }
    }
    await search(rootPath);
    return { content: [{ type: "text", text: results.join("\n") || "No matches found" }] };
});
server.registerTool("get_file_info", { inputSchema: z.object({ path: z.string() }) }, async (args) => {
    const validPath = await validatePath(args.path);
    const stats = await fs.stat(validPath);
    const info = {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        permissions: stats.mode.toString(8)
    };
    return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
});
server.registerTool("list_allowed_directories", { inputSchema: z.object({}) }, async () => {
    return { content: [{ type: "text", text: `Allowed directories:\n${allowedDirectories.join('\n')}` }] };
});
// --- Time Tools ---
server.registerTool("get_current_time", { inputSchema: z.object({ timezone: z.string() }) }, async (args) => {
    const now = new Date();
    const timeStr = now.toLocaleString("en-US", { timeZone: args.timezone });
    return { content: [{ type: "text", text: `Current time in ${args.timezone}: ${timeStr}` }] };
});
// --- Fetch Tools ---
server.registerTool("fetch", { inputSchema: z.object({ url: z.string() }) }, async (args) => {
    try {
        const response = await fetch(args.url);
        const text = await response.text();
        return { content: [{ type: "text", text: text.slice(0, 5000) }] };
    }
    catch (error) {
        return { content: [{ type: "text", text: `Error fetching ${args.url}: ${error}` }] };
    }
});
// --- Git Tools ---
server.registerTool("git_status", { inputSchema: z.object({ repo_path: z.string() }) }, async (args) => {
    try {
        const { stdout } = await execAsync(`git -C "${args.repo_path}" status`);
        return { content: [{ type: "text", text: stdout }] };
    }
    catch (error) {
        return { content: [{ type: "text", text: `Error running git status: ${error}` }] };
    }
});
server.registerTool("git_log", { inputSchema: z.object({ repo_path: z.string(), max_count: z.number().optional().default(10) }) }, async (args) => {
    try {
        const { stdout } = await execAsync(`git -C "${args.repo_path}" log -n ${args.max_count}`);
        return { content: [{ type: "text", text: stdout }] };
    }
    catch (error) {
        return { content: [{ type: "text", text: `Error running git log: ${error}` }] };
    }
});
// --- Everything Tools ---
server.registerTool("echo", { inputSchema: z.object({ message: z.string() }) }, async (args) => {
    return { content: [{ type: "text", text: `Echo: ${args.message}` }] };
});
async function main() {
    const args = process.argv.slice(2);
    const initialAllowedDirs = await Promise.all(args.map(async (dir) => {
        const expanded = expandHome(dir);
        const absolute = path.resolve(expanded);
        try {
            const resolved = await fs.realpath(absolute);
            return normalizePath(resolved);
        }
        catch {
            return normalizePath(absolute);
        }
    }));
    setAllowedDirectories(initialAllowedDirs);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Consolidated MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
