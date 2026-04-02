import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// We need to test the buildTree function, but it's defined inside the request handler
// So we'll extract the core logic into a testable function
import { minimatch } from 'minimatch';

interface TreeEntry {
    name: string;
    type: 'file' | 'directory';
    children?: TreeEntry[];
}

async function buildTreeForTesting(currentPath: string, rootPath: string, excludePatterns: string[] = []): Promise<TreeEntry[]> {
    const entries = await fs.readdir(currentPath, {withFileTypes: true});
    const result: TreeEntry[] = [];

    for (const entry of entries) {
        const relativePath = path.relative(rootPath, path.join(currentPath, entry.name));
        const shouldExclude = excludePatterns.some(pattern => {
            if (pattern.includes('*')) {
                return minimatch(relativePath, pattern, {dot: true});
            }
            // For files: match exact name or as part of path
            // For directories: match as directory path
            return minimatch(relativePath, pattern, {dot: true}) ||
                   minimatch(relativePath, `**/${pattern}`, {dot: true}) ||
                   minimatch(relativePath, `**/${pattern}/**`, {dot: true});
        });
        if (shouldExclude)
            continue;

        const entryData: TreeEntry = {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file'
        };

        if (entry.isDirectory()) {
            const subPath = path.join(currentPath, entry.name);
            entryData.children = await buildTreeForTesting(subPath, rootPath, excludePatterns);
        }

        result.push(entryData);
    }

    return result;
}

describe('buildTree exclude patterns', () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'filesystem-test-'));
        
        // Create test directory structure
        await fs.mkdir(path.join(testDir, 'src'));
        await fs.mkdir(path.join(testDir, 'node_modules'));
        await fs.mkdir(path.join(testDir, '.git'));
        await fs.mkdir(path.join(testDir, 'nested', 'node_modules'), { recursive: true });
        
        // Create test files
        await fs.writeFile(path.join(testDir, '.env'), 'SECRET=value');
        await fs.writeFile(path.join(testDir, '.env.local'), 'LOCAL_SECRET=value');
        await fs.writeFile(path.join(testDir, 'src', 'index.js'), 'console.log("hello");');
        await fs.writeFile(path.join(testDir, 'package.json'), '{}');
        await fs.writeFile(path.join(testDir, 'node_modules', 'module.js'), 'module.exports = {};');
        await fs.writeFile(path.join(testDir, 'nested', 'node_modules', 'deep.js'), 'module.exports = {};');
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should exclude files matching simple patterns', async () => {
        // Test the current implementation - this will fail until the bug is fixed
        const tree = await buildTreeForTesting(testDir, testDir, ['.env']);
        const fileNames = tree.map(entry => entry.name);
        
        expect(fileNames).not.toContain('.env');
        expect(fileNames).toContain('.env.local'); // Should not exclude this
        expect(fileNames).toContain('src');
        expect(fileNames).toContain('package.json');
    });

    it('should exclude directories matching simple patterns', async () => {
        const tree = await buildTreeForTesting(testDir, testDir, ['node_modules']);
        const dirNames = tree.map(entry => entry.name);
        
        expect(dirNames).not.toContain('node_modules');
        expect(dirNames).toContain('src');
        expect(dirNames).toContain('.git');
    });

    it('should exclude nested directories with same pattern', async () => {
        const tree = await buildTreeForTesting(testDir, testDir, ['node_modules']);
        
        // Find the nested directory
        const nestedDir = tree.find(entry => entry.name === 'nested');
        expect(nestedDir).toBeDefined();
        expect(nestedDir!.children).toBeDefined();
        
        // The nested/node_modules should also be excluded
        const nestedChildren = nestedDir!.children!.map(child => child.name);
        expect(nestedChildren).not.toContain('node_modules');
    });

    it('should handle glob patterns correctly', async () => {
        const tree = await buildTreeForTesting(testDir, testDir, ['*.env']);
        const fileNames = tree.map(entry => entry.name);
        
        expect(fileNames).not.toContain('.env');
        expect(fileNames).toContain('.env.local'); // *.env should not match .env.local
        expect(fileNames).toContain('src');
    });

    it('should handle dot files correctly', async () => {
        const tree = await buildTreeForTesting(testDir, testDir, ['.git']);
        const dirNames = tree.map(entry => entry.name);
        
        expect(dirNames).not.toContain('.git');
        expect(dirNames).toContain('.env'); // Should not exclude this
    });

    it('should work with multiple exclude patterns', async () => {
        const tree = await buildTreeForTesting(testDir, testDir, ['node_modules', '.env', '.git']);
        const entryNames = tree.map(entry => entry.name);
        
        expect(entryNames).not.toContain('node_modules');
        expect(entryNames).not.toContain('.env');
        expect(entryNames).not.toContain('.git');
        expect(entryNames).toContain('src');
        expect(entryNames).toContain('package.json');
    });

    it('should handle empty exclude patterns', async () => {
        const tree = await buildTreeForTesting(testDir, testDir, []);
        const entryNames = tree.map(entry => entry.name);
        
        // All entries should be included
        expect(entryNames).toContain('node_modules');
        expect(entryNames).toContain('.env');
        expect(entryNames).toContain('.git');
        expect(entryNames).toContain('src');
    });
});