import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { buildDirectoryTree, setAllowedDirectories } from '../lib.js';

describe('buildDirectoryTree exclude patterns', () => {
    let testDir: string;

    beforeEach(async () => {
        // On macOS, os.tmpdir() returns /var/folders/... which symlinks to
        // /private/var/folders/..., and validatePath compares against the
        // resolved real path. Resolve once up front so allowedDirectories
        // matches what the recursion sees.
        testDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'filesystem-test-')));
        setAllowedDirectories([testDir]);

        await fs.mkdir(path.join(testDir, 'src'));
        await fs.mkdir(path.join(testDir, 'node_modules'));
        await fs.mkdir(path.join(testDir, '.git'));
        await fs.mkdir(path.join(testDir, 'nested', 'node_modules'), { recursive: true });

        await fs.writeFile(path.join(testDir, '.env'), 'SECRET=value');
        await fs.writeFile(path.join(testDir, '.env.local'), 'LOCAL_SECRET=value');
        await fs.writeFile(path.join(testDir, 'src', 'index.js'), 'console.log("hello");');
        await fs.writeFile(path.join(testDir, 'package.json'), '{}');
        await fs.writeFile(path.join(testDir, 'node_modules', 'module.js'), 'module.exports = {};');
        await fs.writeFile(path.join(testDir, 'nested', 'node_modules', 'deep.js'), 'module.exports = {};');
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
        setAllowedDirectories([]);
    });

    it('should exclude files matching simple patterns', async () => {
        const tree = await buildDirectoryTree(testDir, ['.env']);
        const fileNames = tree.map(entry => entry.name);

        expect(fileNames).not.toContain('.env');
        expect(fileNames).toContain('.env.local');
        expect(fileNames).toContain('src');
        expect(fileNames).toContain('package.json');
    });

    it('should exclude directories matching simple patterns', async () => {
        const tree = await buildDirectoryTree(testDir, ['node_modules']);
        const dirNames = tree.map(entry => entry.name);

        expect(dirNames).not.toContain('node_modules');
        expect(dirNames).toContain('src');
        expect(dirNames).toContain('.git');
    });

    it('should exclude nested directories with same pattern', async () => {
        const tree = await buildDirectoryTree(testDir, ['node_modules']);

        const nestedDir = tree.find(entry => entry.name === 'nested');
        expect(nestedDir).toBeDefined();
        expect(nestedDir!.children).toBeDefined();

        const nestedChildren = nestedDir!.children!.map(child => child.name);
        expect(nestedChildren).not.toContain('node_modules');
    });

    it('should handle glob patterns correctly', async () => {
        const tree = await buildDirectoryTree(testDir, ['*.env']);
        const fileNames = tree.map(entry => entry.name);

        expect(fileNames).not.toContain('.env');
        expect(fileNames).toContain('.env.local');
        expect(fileNames).toContain('src');
    });

    it('should handle dot files correctly', async () => {
        const tree = await buildDirectoryTree(testDir, ['.git']);
        const dirNames = tree.map(entry => entry.name);

        expect(dirNames).not.toContain('.git');
        expect(dirNames).toContain('.env');
    });

    it('should work with multiple exclude patterns', async () => {
        const tree = await buildDirectoryTree(testDir, ['node_modules', '.env', '.git']);
        const entryNames = tree.map(entry => entry.name);

        expect(entryNames).not.toContain('node_modules');
        expect(entryNames).not.toContain('.env');
        expect(entryNames).not.toContain('.git');
        expect(entryNames).toContain('src');
        expect(entryNames).toContain('package.json');
    });

    it('should handle empty exclude patterns', async () => {
        const tree = await buildDirectoryTree(testDir, []);
        const entryNames = tree.map(entry => entry.name);

        expect(entryNames).toContain('node_modules');
        expect(entryNames).toContain('.env');
        expect(entryNames).toContain('.git');
        expect(entryNames).toContain('src');
    });
});
