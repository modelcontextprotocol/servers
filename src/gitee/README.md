# Gitee MCP Server

MCP Server for the Gitee API, enabling file operations, repository management, issue management, pull request management, and more.

### Features

- **Configurable API Endpoint**: The Gitee API endpoint URL can be configured through environment variables
- **Comprehensive Error Handling**: Clear error messages for common issues
- **Automatic Branch Creation**: When creating/updating files or pushing changes, branches are automatically created if they don't exist
- **Git History Preservation**: Operations maintain proper Git history without force pushing
- **Batch Operations**: Support for both single-file and multi-file operations

## Tools

### Repository Operations

1. `create_repository`
   - Create a new Gitee repository
   - Inputs:
     - `name` (string): Repository name
     - `description` (optional string): Repository description
     - `homepage` (optional string): Homepage URL
     - `private` (optional boolean): Whether the repository is private
     - `has_issues` (optional boolean): Whether to enable Issue functionality
     - `has_wiki` (optional boolean): Whether to enable Wiki functionality
     - `auto_init` (optional boolean): Whether to automatically initialize the repository
     - `gitignore_template` (optional string): Git Ignore template
     - `license_template` (optional string): License template
     - `path` (optional string): Repository path
   - Returns: Created repository details

2. `fork_repository`
   - Fork a Gitee repository to your account or specified organization
   - Inputs:
     - `owner` (string): Repository owner (username or organization)
     - `repo` (string): Repository name
     - `organization` (optional string): Organization to fork to (defaults to personal account)
   - Returns: Forked repository details

### Branch Operations

3. `create_branch`
   - Create a new branch in a Gitee repository
   - Inputs:
     - `owner` (string): Repository owner (username or organization)
     - `repo` (string): Repository name
     - `branch_name` (string): Name for the new branch
     - `refs` (string): Source reference for the branch, default: master
   - Returns: Created branch details

4. `list_branches`
   - List branches in a Gitee repository
   - Inputs:
     - `owner` (string): Repository owner (username or organization)
     - `repo` (string): Repository name
     - `sort` (optional string): Sort field
     - `direction` (optional string): Sort direction (asc or desc)
     - `page` (optional number): Page number
     - `per_page` (optional number): Number of items per page
   - Returns: List of branches

5. `get_branch`
   - Get details of a specific branch in a Gitee repository
   - Inputs:
     - `owner` (string): Repository owner (username or organization)
     - `repo` (string): Repository name
     - `branch` (string): Branch name
   - Returns: Branch details

### File Operations

6. `get_file_contents`
   - Get the contents of a file or directory from a Gitee repository
   - Inputs:
     - `owner` (string): Repository owner (username or organization)
     - `repo` (string): Repository name
     - `path` (string): Path to the file or directory
     - `branch` (optional string): Branch to get contents from
   - Returns: File or directory contents

7. `create_or_update_file`
   - Create or update a single file in a Gitee repository
   - Inputs:
     - `owner` (string): Repository owner (username or organization)
     - `repo` (string): Repository name
     - `path` (string): Path where to create/update the file
     - `content` (string): Content of the file
     - `message` (string): Commit message
     - `branch` (optional string): Branch name, defaults to the repository's default branch
     - `sha` (optional string): File SHA, required when updating an existing file
   - Returns: File operation result

8. `push_files`
   - Push multiple files to a Gitee repository in a single commit
   - Inputs:
     - `owner` (string): Repository owner (username or organization)
     - `repo` (string): Repository name
     - `branch` (optional string): Branch to push to
     - `message` (string): Commit message
     - `files` (array): Array of files to push, each with path and content
   - Returns: Operation result

### Issue Operations

9. `create_issue`
   - Create a new issue in a Gitee repository
   - Inputs:
     - `owner` (string): Repository owner (username or organization)
     - `repo` (string): Repository name
     - `title` (string): Issue title
     - `body` (optional string): Issue content
     - `assignees` (optional array): Users assigned to the issue
     - `milestone` (optional number): Milestone ID
     - `labels` (optional array): Labels
     - `security_hole` (optional boolean): Whether the issue is private
   - Returns: Created issue details

10. `get_issue`
    - Get details of a specific issue in a Gitee repository
    - Inputs:
      - `owner` (string): Repository owner (username or organization)
      - `repo` (string): Repository name
      - `issue_number` (number): Issue number
    - Returns: Issue details

11. `update_issue`
    - Update an existing issue in a Gitee repository
    - Inputs:
      - `owner` (string): Repository owner (username or organization)
      - `repo` (string): Repository name
      - `issue_number` (number): Issue number
      - `title` (optional string): Issue title
      - `body` (optional string): Issue content
      - `assignees` (optional array): Users assigned to the issue
      - `milestone` (optional number): Milestone ID
      - `labels` (optional array): Labels
      - `state` (optional string): Issue state (open, closed, progressing)
    - Returns: Updated issue details

12. `add_issue_comment`
    - Add a comment to an existing issue
    - Inputs:
      - `owner` (string): Repository owner (username or organization)
      - `repo` (string): Repository name
      - `issue_number` (number): Issue number
      - `body` (string): Comment content
    - Returns: Created comment details

13. `list_issues`
    - List issues in a Gitee repository with filtering options
    - Inputs:
      - `owner` (string): Repository owner (username or organization)
      - `repo` (string): Repository name
      - `state` (optional string): Issue state (open, closed, all)
      - `sort` (optional string): Sort field (created, updated, comments)
      - `direction` (optional string): Sort direction (asc, desc)
      - `labels` (optional string): Labels, multiple labels separated by commas
      - `milestone` (optional number): Milestone ID
      - `assignee` (optional string): Filter issues assigned to a specific user
      - `creator` (optional string): Filter issues created by a specific user
      - `program` (optional string): Filter issues for a specific program
      - `page` (optional number): Page number
      - `per_page` (optional number): Number of items per page, maximum 100
    - Returns: List of issues

### Pull Request Operations

14. `create_pull_request`
    - Create a new pull request in a Gitee repository
    - Inputs:
      - `owner` (string): Repository owner (username or organization)
      - `repo` (string): Repository name
      - `title` (string): Pull Request title
      - `head` (string): Source branch name
      - `base` (string): Target branch name
      - `body` (optional string): Pull Request content
      - `milestone_number` (optional number): Milestone number
      - `labels` (optional array): Labels
      - `issue` (optional string): Related issue, format: #xxx
      - `assignees` (optional array): Reviewers
      - `testers` (optional array): Testers
      - `prune_source_branch` (optional boolean): Whether to delete the source branch after merging
    - Returns: Created pull request details

### User Operations

15. `get_user`
    - Get details of a Gitee user
    - Inputs:
      - `username` (string): Username
    - Returns: User details

## Installation

1. Clone the repository
2. Install dependencies
3. Build the project

```bash
cd src/gitee

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Create a `.env` file in the root directory with the following content:

```
GITEE_PERSONAL_ACCESS_TOKEN=put_your_gitee_personal_access_token_here
```

You can obtain a personal access token from your Gitee account settings.

## Usage

### Running the Server

```bash
# Start the server
npm start
```

The server runs on stdio, which allows it to be used as a subprocess by MCP clients.

### Docker

You can also run the server using Docker:

```bash
# Build the Docker image
docker build -t gitee-mcp-server -f Dockerfile .

# Run the container
docker run -e GITEE_PERSONAL_ACCESS_TOKEN=your_token gitee-mcp-server
```

## Dependencies

- `@modelcontextprotocol/sdk`: MCP SDK for server implementation
- `universal-user-agent`: For user agent string generation
- `zod`: For schema validation
- `zod-to-json-schema`: For converting Zod schemas to JSON schemas

## Debug Utilities

The server includes a debug utility function that can be used to log debug information:

```typescript
import { debug } from './common/utils.js';

debug('Message to log');
debug('Message with data:', { key: 'value' });
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.

## Authors

- 诺墨 <normal@normalcoder.com>
- Gitee (https://gitee.com)

## Links

- [Model Context Protocol](https://modelcontextprotocol.io)
