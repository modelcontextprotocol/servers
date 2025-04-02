/**
 * File Analyzer Module for Sequential Thinking
 * 
 * This module provides utilities to analyze file structures and contents
 * for the Sequential Thinking server.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

// Convert fs.readdir to Promise-based
const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);
const readFile = util.promisify(fs.readFile);

// File extensions to include in content analysis
const CONTENT_ANALYSIS_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', 
  '.md', '.py', '.java', '.c', '.cpp', '.h', '.go'
];

// File extensions to exclude from analysis
const EXCLUDED_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2',
  '.ttf', '.eot', '.otf', '.mp4', '.mp3', '.wav', '.pdf', '.zip',
  '.tar', '.gz', '.rar'
];

// Directories to exclude
const EXCLUDED_DIRS = [
  'node_modules', '.git', 'dist', 'build', 'coverage', '.idea', '.vscode',
  '__pycache__', 'venv', 'env', '.env', '.DS_Store'
];

// Maximum file size for content analysis (in bytes)
const MAX_FILE_SIZE = 1024 * 1024; // 1MB

// Maximum depth for directory traversal
const MAX_DEPTH = 10;

interface FileInfo {
  path: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
  summary?: string; // Optional summary of file content
}

interface DirectoryStructure {
  path: string;
  files: FileInfo[];
  directories: DirectoryStructure[];
}

// Track file relationships for project context
interface FileRelationship {
  source: string;
  target: string;
  type: 'import' | 'extends' | 'implements' | 'uses';
  strength: number; // 0-1 indicating relationship strength
}

// Enhanced ProjectAnalysis interface
interface ProjectAnalysis {
  rootDir: string;
  structure: DirectoryStructure;
  fileCount: number;
  directoryCount: number;
  fileTypes: Record<string, number>;
  importantFiles: FileInfo[];
  relationships?: FileRelationship[]; // New: track file relationships
  entryPoints?: string[]; // New: main entry points to the project
  codeInsights?: { // New: overall code insights
    complexity: 'low' | 'medium' | 'high';
    modularity: 'low' | 'medium' | 'high';
    patterns: string[];
    keyComponents: string[];
  }
}

/**
 * Analyzes a project directory and returns its structure and statistics
 */
export async function analyzeProject(
  rootDir: string,
  maxDepth: number = MAX_DEPTH
): Promise<ProjectAnalysis> {
  console.log(`Analyzing project directory: ${rootDir}`);
  
  const structure = await scanDirectory(rootDir, 0, maxDepth);
  const fileTypes: Record<string, number> = {};
  let fileCount = 0;
  let directoryCount = 0;
  const importantFiles: FileInfo[] = [];
  const allFiles: FileInfo[] = [];
  
  // Process the structure to collect statistics
  function processStructure(dir: DirectoryStructure) {
    directoryCount++;
    
    // Process files
    for (const file of dir.files) {
      fileCount++;
      allFiles.push(file);
      if (file.extension) {
        fileTypes[file.extension] = (fileTypes[file.extension] || 0) + 1;
      }
      
      // Identify important files
      if (isImportantFile(file.path)) {
        importantFiles.push(file);
      }
    }
    
    // Process directories recursively
    for (const subdir of dir.directories) {
      processStructure(subdir);
    }
  }
  
  processStructure(structure);
  
  // Enhanced analysis for relationships and insights
  console.log("Analyzing file relationships...");
  const relationships = await analyzeFileRelationships(allFiles, rootDir);
  
  console.log("Identifying project entry points...");
  const entryPoints = identifyEntryPoints(allFiles, rootDir);
  
  console.log("Generating code insights...");
  const codeInsights = analyzeCodeInsights(allFiles, relationships);
  
  return {
    rootDir,
    structure,
    fileCount,
    directoryCount,
    fileTypes,
    importantFiles,
    relationships,
    entryPoints,
    codeInsights
  };
}

/**
 * Analyzes dependencies and relationships between files
 */
async function analyzeFileRelationships(files: FileInfo[], rootDir: string): Promise<FileRelationship[]> {
  const relationships: FileRelationship[] = [];
  const jsExtensions = ['.js', '.jsx', '.ts', '.tsx'];
  
  // Filter to only analyze code files
  const codeFiles = files.filter(file => 
    file.extension && jsExtensions.includes(file.extension));
  
  // Create a map of relative paths to files for quick lookup
  const fileMap = new Map<string, FileInfo>();
  codeFiles.forEach(file => {
    const relativePath = path.relative(rootDir, file.path);
    fileMap.set(relativePath, file);
    // Also map without extension for import resolution
    const pathWithoutExt = relativePath.replace(/\.[^/.]+$/, '');
    fileMap.set(pathWithoutExt, file);
  });
  
  // Analyze each file for imports
  for (const file of codeFiles) {
    try {
      const content = await readFile(file.path, 'utf8');
      const sourceRelativePath = path.relative(rootDir, file.path);
      
      // Extract import statements
      const importRegex = /import\s+(?:{[^}]*}\s+from\s+)?['"]([^'"]+)['"]/g;
      let match;
      
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        
        // Skip package imports (those that don't start with . or ..)
        if (!importPath.startsWith('.')) continue;
        
        // Resolve relative import path to absolute
        const sourceDir = path.dirname(file.path);
        let resolvedPath = path.resolve(sourceDir, importPath);
        
        // Try to match with files we know about
        const targetRelativePath = path.relative(rootDir, resolvedPath);
        
        // Look for the file with or without extension
        let targetFile = fileMap.get(targetRelativePath);
        if (!targetFile) {
          // Try common extensions
          for (const ext of jsExtensions) {
            targetFile = fileMap.get(targetRelativePath + ext) ||
                        fileMap.get(targetRelativePath + '/index' + ext);
            if (targetFile) break;
          }
        }
        
        if (targetFile) {
          const targetRelativePath = path.relative(rootDir, targetFile.path);
          relationships.push({
            source: sourceRelativePath,
            target: targetRelativePath,
            type: 'import',
            strength: 0.8
          });
        }
      }
      
      // Look for class extensions or implementations
      const extendsRegex = /class\s+(\w+)\s+extends\s+(\w+)/g;
      const implementsRegex = /class\s+(\w+)\s+implements\s+([\w,\s]+)/g;
      
      while ((match = extendsRegex.exec(content)) !== null) {
        // This is a simplification - would need more complex analysis to properly resolve
        relationships.push({
          source: sourceRelativePath,
          target: match[2], // Just store the class name as we don't know the file
          type: 'extends',
          strength: 0.6
        });
      }
      
      while ((match = implementsRegex.exec(content)) !== null) {
        // Store implementations
        const interfaces = match[2].split(',').map(i => i.trim());
        for (const iface of interfaces) {
          relationships.push({
            source: sourceRelativePath,
            target: iface,
            type: 'implements',
            strength: 0.5
          });
        }
      }
    } catch (error) {
      console.error(`Error analyzing relationships for file: ${file.path}`, error);
    }
  }
  
  return relationships;
}

/**
 * Identify potential entry points to the project
 */
function identifyEntryPoints(files: FileInfo[], rootDir: string): string[] {
  const entryPoints: string[] = [];
  const entryPointPatterns = [
    'index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts', 
    'server.js', 'server.ts', 'start.js', 'start.ts'
  ];
  
  // Check for common entry point files
  for (const file of files) {
    const fileName = path.basename(file.path);
    if (entryPointPatterns.includes(fileName)) {
      entryPoints.push(path.relative(rootDir, file.path));
    }
  }
  
  // Check package.json for main entry
  const packageJsonFile = files.find(f => path.basename(f.path) === 'package.json');
  if (packageJsonFile) {
    try {
      const content = fs.readFileSync(packageJsonFile.path, 'utf8');
      const packageJson = JSON.parse(content);
      if (packageJson.main) {
        const mainPath = path.resolve(path.dirname(packageJsonFile.path), packageJson.main);
        entryPoints.push(path.relative(rootDir, mainPath));
      }
    } catch (error) {
      console.error('Error parsing package.json:', error);
    }
  }
  
  return [...new Set(entryPoints)]; // Remove duplicates
}

/**
 * Analyze project for overall code insights
 */
function analyzeCodeInsights(files: FileInfo[], relationships: FileRelationship[]): {
  complexity: 'low' | 'medium' | 'high';
  modularity: 'low' | 'medium' | 'high';
  patterns: string[];
  keyComponents: string[];
} {
  // Count files by type for complexity estimation
  const jsFiles = files.filter(f => ['.js', '.jsx', '.ts', '.tsx'].includes(f.extension || ''));
  
  // Detect patterns based on directory structure and file naming
  const patterns: string[] = [];
  
  // Check for common patterns
  const fileNames = files.map(f => path.basename(f.path));
  
  if (fileNames.includes('store.js') || fileNames.includes('store.ts') || 
      fileNames.some(n => n.includes('reducer'))) {
    patterns.push('Redux/Flux pattern');
  }
  
  if (fileNames.some(n => n.endsWith('.component.ts')) || 
      fileNames.some(n => n.endsWith('.service.ts'))) {
    patterns.push('Angular architecture');
  }
  
  if (fileNames.some(n => n.endsWith('.vue'))) {
    patterns.push('Vue.js components');
  }
  
  if (fileNames.some(n => n.includes('controller')) && 
      fileNames.some(n => n.includes('model'))) {
    patterns.push('MVC architecture');
  }
  
  // Identify key components based on relationship centrality
  const componentCounts = new Map<string, number>();
  relationships.forEach(r => {
    componentCounts.set(r.source, (componentCounts.get(r.source) || 0) + 1);
    componentCounts.set(r.target, (componentCounts.get(r.target) || 0) + 1);
  });
  
  const keyComponents = Array.from(componentCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([file]) => file);
  
  // Determine complexity based on file count and relationships
  let complexity: 'low' | 'medium' | 'high' = 'low';
  if (jsFiles.length > 100 || relationships.length > 200) {
    complexity = 'high';
  } else if (jsFiles.length > 30 || relationships.length > 50) {
    complexity = 'medium';
  }
  
  // Determine modularity based on relationship patterns
  // High modularity: few components with many connections
  // Low modularity: many components with few connections each
  const uniqueTargets = new Set(relationships.map(r => r.target));
  const modularity = 
    uniqueTargets.size < relationships.length / 3 ? 'high' :
    uniqueTargets.size < relationships.length / 2 ? 'medium' : 'low';
  
  return {
    complexity,
    modularity,
    patterns,
    keyComponents
  };
}

/**
 * Determines if a file is important based on its name and path
 */
function isImportantFile(filePath: string): boolean {
  const filename = path.basename(filePath).toLowerCase();
  
  const importantFilenames = [
    'package.json', 'tsconfig.json', 'webpack.config.js', 
    'readme.md', 'license', 'docker-compose.yml', 'dockerfile',
    'makefile', 'index.js', 'index.ts', 'main.py', 'app.js', 
    'app.ts', 'server.js', 'server.ts', 'config.js', 'config.ts',
    '.gitignore', '.env.example'
  ];
  
  return importantFilenames.includes(filename);
}

/**
 * Scans a directory recursively
 */
async function scanDirectory(
  dirPath: string,
  currentDepth: number,
  maxDepth: number
): Promise<DirectoryStructure> {
  if (currentDepth > maxDepth) {
    return {
      path: dirPath,
      files: [],
      directories: []
    };
  }
  
  try {
    const entries = await readdir(dirPath);
    const files: FileInfo[] = [];
    const directories: DirectoryStructure[] = [];
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      
      try {
        const stats = await stat(fullPath);
        
        if (stats.isDirectory()) {
          const dirName = path.basename(fullPath);
          
          // Skip excluded directories
          if (EXCLUDED_DIRS.includes(dirName)) {
            continue;
          }
          
          // Recursively scan subdirectory
          const subdir = await scanDirectory(fullPath, currentDepth + 1, maxDepth);
          directories.push(subdir);
        }
        else if (stats.isFile()) {
          const extension = path.extname(fullPath).toLowerCase();
          
          // Skip excluded file types
          if (EXCLUDED_EXTENSIONS.includes(extension)) {
            continue;
          }
          
          const fileInfo: FileInfo = {
            path: fullPath,
            type: 'file',
            size: stats.size,
            extension
          };
          
          // Add content summary for certain file types if not too large
          if (CONTENT_ANALYSIS_EXTENSIONS.includes(extension) && stats.size <= MAX_FILE_SIZE) {
            try {
              fileInfo.summary = await summarizeFileContent(fullPath);
            } catch (error) {
              console.error(`Error analyzing file content: ${fullPath}`, error);
            }
          }
          
          files.push(fileInfo);
        }
      } catch (error) {
        console.error(`Error processing entry: ${fullPath}`, error);
      }
    }
    
    return {
      path: dirPath,
      files,
      directories
    };
  } catch (error) {
    console.error(`Error scanning directory: ${dirPath}`, error);
    return {
      path: dirPath,
      files: [],
      directories: []
    };
  }
}

/**
 * Creates a more detailed summary of a file's content with key structural information
 */
export async function summarizeFileContent(filePath: string): Promise<string> {
  try {
    // Read the file
    const content = await readFile(filePath, 'utf8');
    
    // Get file extension
    const extension = path.extname(filePath).toLowerCase();
    
    // Apply different summarization strategies based on file type
    if (extension === '.json') {
      try {
        const json = JSON.parse(content);
        // For package.json files, extract more useful information
        if (path.basename(filePath) === 'package.json') {
          const name = json.name || 'unnamed';
          const version = json.version || 'unknown';
          const dependencies = Object.keys(json.dependencies || {}).length;
          const devDependencies = Object.keys(json.devDependencies || {}).length;
          const scripts = Object.keys(json.scripts || {}).length;
          
          return `Package: ${name}@${version} with ${dependencies} dependencies, ${devDependencies} dev dependencies, and ${scripts} scripts. Main scripts: ${Object.keys(json.scripts || {}).slice(0, 3).join(', ')}${Object.keys(json.scripts || {}).length > 3 ? '...' : ''}`;
        }
        // For tsconfig.json, extract compiler options
        else if (path.basename(filePath) === 'tsconfig.json') {
          const compilerOptions = json.compilerOptions || {};
          return `TypeScript configuration with target: ${compilerOptions.target || 'unknown'}, module: ${compilerOptions.module || 'unknown'}, includes ${json.include ? json.include.length : 0} patterns`;
        }
        // Generic JSON handling
        return `JSON with keys: ${Object.keys(json).join(', ')}`;
      } catch (e) {
        return 'Invalid JSON file';
      }
    } 
    else if (extension === '.md') {
      // Extract headings and first paragraph
      const headings = content.match(/^#+\s+.+$/gm) || [];
      const firstParagraph = content.match(/^(?!#).+(?:\n(?!#|\n).+)*/) || [''];
      const title = headings.length > 0 ? (headings[0] || '').replace(/^#+\s+/, '') : 'No title';
      const paragraph = firstParagraph[0] || '';
      return `Markdown document: ${title}\n${headings.length} headings. First paragraph: ${paragraph.substring(0, 150)}${paragraph.length > 150 ? '...' : ''}`;
    }
    else if (['.js', '.jsx', '.ts', '.tsx'].includes(extension)) {
      // Extract key code components
      const imports = content.match(/import\s+.+from\s+['"].+['"];?/g) || [];
      const exports = content.match(/export\s+(?:default\s+)?(?:const|let|var|function|class|interface)\s+\w+/g) || [];
      const classes = content.match(/class\s+\w+\s*(?:extends\s+\w+)?\s*\{/g) || [];
      const functions = content.match(/(?:function|const|let|var)\s+(\w+)\s*(?:=\s*(?:async\s*)?(?:\(|function))?/g) || [];
      
      // Extract component names for React files
      const isReactFile = imports.some(imp => imp.includes('react'));
      
      let summary = `${path.extname(filePath).substring(1)} file with ${imports.length} imports`;      
      
      // Add class and function details
      if (classes.length > 0) {
        summary += `\nClasses (${classes.length}): ${classes.map(c => c.match(/class\s+(\w+)/)?.[1]).filter(Boolean).join(', ')}`;
      }
      
      if (functions.length > 0) {
        // Extract function names and limit to 5
        const functionNames = functions
          .map(f => f.match(/(?:function|const|let|var)\s+(\w+)/)?.[1])
          .filter(Boolean)
          .slice(0, 5);
        summary += `\nFunctions: ${functionNames.join(', ')}${functions.length > 5 ? '...' : ''}`;
      }
      
      if (exports.length > 0) {
        // Extract export names
        const exportNames = exports
          .map(e => e.match(/export\s+(?:default\s+)?(?:const|let|var|function|class|interface)\s+(\w+)/)?.[1])
          .filter(Boolean);
        summary += `\nExports: ${exportNames.join(', ')}`;
      }
      
      // For React files, provide additional context
      if (isReactFile) {
        const isComponent = classes.some(c => c.includes('Component')) || 
                          content.includes('React.createElement') || 
                          content.includes('useState') || 
                          content.includes('<') && content.includes('/>');
        
        if (isComponent) {
          summary += '\nReact component detected';
        }
      }
      
      return summary;
    }
    else if (['.css', '.scss', '.less'].includes(extension)) {
      // Extract CSS selectors and rules
      const selectors = content.match(/[.#]?[a-zA-Z0-9_-]+\s*\{/g) || [];
      const mediaQueries = content.match(/@media\s+[^{]+\{/g) || [];
      
      return `Stylesheet with ${selectors.length} selectors and ${mediaQueries.length} media queries`;
    }
    else if (['.html', '.htm'].includes(extension)) {
      // Extract HTML elements
      const titleMatch = content.match(/<title>([^<]+)<\/title>/) || [];
      const title = titleMatch[1] || 'No title';
      const headings = content.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/g) || [];
      
      return `HTML document: "${title}" with ${headings.length} headings`;
    }
    else {
      // Generic summary: first line and size
      const firstLine = content.split('\n')[0].trim();
      return `${content.length} bytes, starts with: ${firstLine.substring(0, 60)}${firstLine.length > 60 ? '...' : ''}`;
    }
  } catch (error) {
    console.error(`Error summarizing file: ${filePath}`, error);
    return 'Error analyzing file content';
  }
}

/**
 * Formats project structure as a string with enhanced analysis
 */
export function formatProjectStructure(analysis: ProjectAnalysis): string {
  let result = `Project Root: ${analysis.rootDir}\n`;
  result += `Files: ${analysis.fileCount}, Directories: ${analysis.directoryCount}\n\n`;
  
  // Add file type distribution
  result += `File Types:\n`;
  for (const [ext, count] of Object.entries(analysis.fileTypes).sort((a, b) => b[1] - a[1])) {
    result += `  ${ext}: ${count}\n`;
  }
  
  // Add entry points
  if (analysis.entryPoints && analysis.entryPoints.length > 0) {
    result += '\nEntry Points:\n';
    for (const entryPoint of analysis.entryPoints) {
      result += `  ${entryPoint}\n`;
    }
  }
  
  // Add code insights
  if (analysis.codeInsights) {
    result += '\nCode Insights:\n';
    result += `  Complexity: ${analysis.codeInsights.complexity}\n`;
    result += `  Modularity: ${analysis.codeInsights.modularity}\n`;
    
    if (analysis.codeInsights.patterns.length > 0) {
      result += `  Detected Patterns: ${analysis.codeInsights.patterns.join(', ')}\n`;
    }
    
    if (analysis.codeInsights.keyComponents.length > 0) {
      result += `  Key Components: ${analysis.codeInsights.keyComponents.join(', ')}\n`;
    }
  }
  
  result += '\nImportant Files:\n';
  for (const file of analysis.importantFiles) {
    const relativePath = path.relative(analysis.rootDir, file.path);
    result += `  ${relativePath}\n`;
  }
  
  result += '\nDirectory Structure:\n';
  result += formatDirectoryStructure(analysis.structure, analysis.rootDir, 0);
  
  return result;
}

/**
 * Formats a directory structure recursively
 */
function formatDirectoryStructure(
  dir: DirectoryStructure,
  rootDir: string,
  level: number,
  maxLevel: number = 4
): string {
  if (level > maxLevel) {
    return `${'  '.repeat(level)}... (max depth reached)\n`;
  }
  
  let result = '';
  const relativePath = path.relative(rootDir, dir.path);
  const displayPath = relativePath || './';
  
  result += `${'  '.repeat(level)}${displayPath}/\n`;
  
  // First list files in this directory
  for (const file of dir.files) {
    const fileName = path.basename(file.path);
    result += `${'  '.repeat(level + 1)}${fileName}\n`;
  }
  
  // Then recursively list subdirectories
  for (const subdir of dir.directories) {
    result += formatDirectoryStructure(subdir, rootDir, level + 1, maxLevel);
  }
  
  return result;
}

/**
 * Analyzes currently open files to provide additional context
 */
export function analyzeOpenFiles(
  openFilePaths: string[],
  rootDir: string
): string {
  let result = `Open Files (${openFilePaths.length}):\n`;
  
  for (const filePath of openFilePaths) {
    try {
      const relativePath = path.relative(rootDir, filePath);
      const stats = fs.statSync(filePath);
      const extension = path.extname(filePath);
      
      result += `  ${relativePath} (${extension}, ${formatFileSize(stats.size)})\n`;
      
      // For smaller text files, include a brief content preview
      if (stats.size < MAX_FILE_SIZE && CONTENT_ANALYSIS_EXTENSIONS.includes(extension)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const firstLine = content.split('\n')[0].trim();
        
        if (firstLine) {
          result += `    First line: ${firstLine.substring(0, 60)}${firstLine.length > 60 ? '...' : ''}\n`;
        }
      }
    } catch (error) {
      result += `  ${filePath} (Error: Could not analyze file)\n`;
    }
  }
  
  return result;
}

/**
 * Formats file size in a human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
