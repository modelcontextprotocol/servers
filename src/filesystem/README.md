# Filesystem MCP Server

Node.js server implementing Model Context Protocol (MCP) for filesystem operations.

## Features

- Read/write files
- Create/list/delete directories
- Move files/directories
- Search files
- Get file metadata

**Note**: The server will only allow operations within directories specified via `args`.

## API

### Resources

- `file://system`: File system operations interface

### Tools

- **read_file**
  - Read complete contents of a file
  - Input: `path` (string)
  - Reads complete file contents with UTF-8 encoding

- **read_multiple_files**
  - Read multiple files simultaneously
  - Input: `paths` (string[])
  - Failed reads won't stop the entire operation

- **write_file**
  - Create new file or overwrite existing (exercise caution with this)
  - Inputs:
    - `path` (string): File location
    - `content` (string): File content

- **edit_file**
  - Make selective edits using advanced pattern matching and formatting
  - Features:
    - Line-based and multi-line content matching
    - Whitespace normalization with indentation preservation
    - Fuzzy matching with confidence scoring
    - Multiple simultaneous edits with correct positioning
    - Indentation style detection and preservation
    - Git-style diff output with context
    - Preview changes with dry run mode
    - Failed match debugging with confidence scores
  - Inputs:
    - `path` (string): File to edit
    - `edits` (array): List of edit operations
      - `oldText` (string): Text to search for (can be substring)
      - `newText` (string): Text to replace with
    - `dryRun` (boolean): Preview changes without applying (default: false)
    - `options` (object): Optional formatting settings
      - `preserveIndentation` (boolean): Keep existing indentation (default: true)
      - `normalizeWhitespace` (boolean): Normalize spaces while preserving structure (default: true)
      - `partialMatch` (boolean): Enable fuzzy matching (default: true)
  - Returns detailed diff and match information for dry runs, otherwise applies changes
  - Best Practice: Always use dryRun first to preview changes before applying them

- **create_directory**
  - Create new directory or ensure it exists
  - Input: `path` (string)
  - Creates parent directories if needed
  - Succeeds silently if directory exists

- **list_directory**
  - List directory contents with [FILE] or [DIR] prefixes
  - Input: `path` (string)

- **move_file**
  - Move or rename files and directories
  - Inputs:
    - `source` (string)
    - `destination` (string)
  - Fails if destination exists

- **search_files**
  - Recursively search for files/directories
  - Inputs:
    - `path` (string): Starting directory
    - `pattern` (string): Search pattern
    - `excludePatterns` (string[]): Exclude any patterns. Glob formats are supported.
  - Case-insensitive matching
  - Returns full paths to matches

- **get_file_info**
  - Get detailed file/directory metadata
  - Input: `path` (string)
  - Returns:
    - Size
    - Creation time
    - Modified time
    - Access time
    - Type (file/directory)
    - Permissions

- **list_allowed_directories**
  - List all directories the server is allowed to access
  - No input required
  - Returns:
    - Directories that this server can read/write from

- **execute_js_code**
  - Execute JavaScript code on a specified file or directory
  - Inputs:
    - `code` (string): JavaScript code to execute
    - `path` (string): File or directory path to operate on
  - Features:
    - Access to powerful libraries and Node.js standard modules:
      - `fs` (fs/promises): File system operations
      - `path`: Path utilities 
      - `readFileSync`: Direct file reading
      - `_`: Lodash library
      - `math`: MathJS library
      - `Papa`: PapaParse library for CSV processing (if available)
      - `XLSX`: SheetJS library for Excel files (if available)
    - Support for both synchronous and asynchronous code (async/await)
    - Console output capture (log, error, warn)
    - Structured results via the `results` object
    - `catchAsync()` helper function for handling errors in asynchronous code
  - Context variables:
    - `targetPath`: The validated absolute path
    - `isDirectory`: Boolean indicating if path is a directory
    - `isFile`: Boolean indicating if path is a file
    - `fs`: Node.js fs/promises module
    - `readFileSync`: Synchronous file reading function
    - `_`: Lodash library
    - `math`: MathJS library
    - `Papa`: PapaParse library (if available)
    - `XLSX`: SheetJS library (if available)
    - `Buffer`, `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`
    - `catchAsync`: Helper function for safely handling async errors
  - Returns:
    - Console output from executed code
    - Results object containing any data stored during execution
    - Execution metadata (path info, errors if any)
  - Example:
    ```javascript
    // Process a CSV file and calculate statistics
    executeJSCode(`
      // Read the CSV file
      const content = await fs.readFile(targetPath, 'utf8');
      
      // Parse the CSV data
      const parsed = Papa.parse(content, {header: true, dynamicTyping: true});
      
      // Calculate statistics using lodash
      const data = parsed.data;
      
      // Store results for return
      results.rowCount = data.length;
      results.columnNames = Object.keys(data[0]);
      
      // Calculate numeric column statistics
      const numericColumns = {};
      
      results.columnNames.forEach(col => {
        if (typeof data[0][col] === 'number') {
          numericColumns[col] = {
            min: _.minBy(data, col)[col],
            max: _.maxBy(data, col)[col],
            avg: _.meanBy(data, row => row[col]),
            sum: _.sumBy(data, row => row[col])
          };
        }
      });
      
      results.statistics = numericColumns;
      
      console.log(\`Processed ${data.length} rows\`);
    `, 'data.csv');
    ```
    
    ```javascript
    // Process all JavaScript files in a directory
    executeJSCode(`
      // Get all files in directory
      const files = await fs.readdir(targetPath);
      
      // Filter for JavaScript files
      const jsFiles = files.filter(file => file.endsWith('.js'));
      
      // Process each file
      const fileStats = await Promise.all(jsFiles.map(async (file) => {
        const filePath = path.join(targetPath, file);
        const content = await fs.readFile(filePath, 'utf8');
        
        // Count lines and functions
        const lines = content.split('\n');
        const functionCount = (content.match(/function\s+\w+\s*\(/g) || []).length;
        const arrowFunctionCount = (content.match(/(const|let|var)\s+\w+\s*=\s*\(.*\)\s*=>/g) || []).length;
        
        return {
          file,
          lineCount: lines.length,
          functionCount: functionCount + arrowFunctionCount,
          size: (await fs.stat(filePath)).size,
          lastModified: (await fs.stat(filePath)).mtime
        };
      }));
      
      // Calculate total stats
      results.totalFiles = fileStats.length;
      results.totalLines = _.sumBy(fileStats, 'lineCount');
      results.totalFunctions = _.sumBy(fileStats, 'functionCount');
      results.largestFile = _.maxBy(fileStats, 'size');
      results.fileDetails = fileStats;
      
      console.log(`Analyzed ${fileStats.length} JavaScript files`);
    `, 'src');
    ```
    
    ```javascript
    // Example with catchAsync helper for error handling
    executeJSCode(`
      // Synchronous code
      console.log("Starting execution...");
      
      // Async code with proper error handling
      catchAsync(async () => {
        // Simulated async operation that could fail
        setTimeout(() => {
          try {
            // This would normally crash the VM
            throw new Error("This error is safely caught!");
          } catch (e) {
            console.error("Caught timeout error:", e.message);
          }
        }, 100);
        
        // Process a file asynchronously
        try {
          const content = await fs.readFile(targetPath, 'utf8');
          results.fileRead = true;
          results.fileSize = content.length;
        } catch (err) {
          console.error("File read error:", err.message);
          results.fileRead = false;
        }
      });
      
      console.log("Execution will continue even if async code fails");
    `, '/some/file/path');
    ```

## Usage with Claude Desktop
Add this to your `claude_desktop_config.json`:

Note: you can provide sandboxed directories to the server by mounting them to `/projects`. Adding the `ro` flag will make the directory readonly by the server.

### Docker
Note: all directories must be mounted to `/projects` by default.

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--mount", "type=bind,src=/Users/username/Desktop,dst=/projects/Desktop",
        "--mount", "type=bind,src=/path/to/other/allowed/dir,dst=/projects/other/allowed/dir,ro",
        "--mount", "type=bind,src=/path/to/file.txt,dst=/projects/path/to/file.txt",
        "mcp/filesystem",
        "/projects"
      ]
    }
  }
}
```

### NPX

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/username/Desktop",
        "/path/to/other/allowed/dir"
      ]
    }
  }
}
```

## Build

Docker build:

```bash
docker build -t mcp/filesystem -f src/filesystem/Dockerfile .
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
