# Changelog

All notable changes to this project will be documented in this file.

## [1.0.8] - 2026-03-11

### Changed
- **chore**: Bump server version to 1.0.8
  - Updated version to 1.0.8 across package.json, server.json, and server.ts
  - Migrated to `McpServer` API from deprecated `Server` class
  - Implemented `ResourceTemplate` for dynamic resource discovery


## [1.0.7] - 2026-03-07

### Changed
- **chore**: Bump server version to 1.0.7
  - Updated version to 1.0.7 across package.json, server.json, and server.ts
  - Refactored error handling in `resources.ts` to throw `McpError` when connection is not established.


## [1.0.6] - 2026-03-02

### Changed
- **Improved API Security**: Switched to `URLSearchParams` for safe URL construction across all tools and resources, preventing potential encoding issues.
- **Enhanced Connection Feedback**: Improved error handling in `qnap-connect` and removed sensitive session information (SID) from the output.
- **Improved Error Messaging**: Standardized error responses to be more user-friendly and informative.

## [1.0.5] - 2026-02-25

### Added
- **MCP Resources Support**: Introduced native support for MCP Resources.
  - Exposes QNAP **Disks** as resources: `qnap://[ip]:[port]/disk/[disk-id]`.
  - Exposes QNAP **Volumes** as resources: `qnap://[ip]:[port]/volume/[volume-id]`.
  - Allows AI models to directly read structured JSON data for disk health and volume usage.
- **Enhanced Storage Metadata**: Updated internal parsing logic to include volume IDs, enabling more reliable resource addressing.
- **Resource Handlers**: Implemented `listResourcesHandler` and `readResourceHandler` for full MCP compatibility.

## [1.0.4] - 2026-02-23

### Changed
- **Version Synchronization**: Updated versioning across `package.json`, `server.ts`, and `server.json` to 1.0.4.
- **Project Maintenance**: Verified server stability and report accuracy through automated backup and swarm status workflows.

## [1.0.3] - 2026-02-12

### Added
- **Professional Tabular Output**: Standardized `qnap-dir` and `qnap-report` to use the `toon` encoding format for high-quality tabular data.
- **Enhanced qnap-report**:
  - Now returns a professional **Markdown report** instead of raw JSON.
  - Includes Disk Health and Storage Information in styled tables.
  - Improved formatting for resource usage (CPU, Memory, Uptime).
- **Improved qnap-dir**:
  - Automatically **sorts files by modification date** (newest first).
  - Robust directory detection across different QNAP firmware versions (handling `isfolder`, `is_dir`, and `filetype` inconsistencies).
  - Human-friendly file sizes (KB, MB, GB).

## [1.0.2] - 2026-02-10

### Added
- **Enhanced qnap-report Tool**: Completely rewritten in native TypeScript for better performance and reliability.
  - Replaced Python-based report collector with native Node.js implementation.
  - Returns structured **JSON format** instead of plain text, perfect for AI parsing.
  - Added detailed **Disk Health** (model, serial, capacity, temperature, health status).
  - Added granular **Resource Usage** (CPU load, memory breakdown, uptime, system temperature).
  - Added comprehensive **Storage Info** (volume labels, total/used/free space, usage percentages).

## [1.0.1] - 2026-02-09

### Changed
- **Major refactoring for improved maintainability**: Restructured codebase following MySQL MCP server patterns
  - Separated tool handlers into individual files in `tools/` directory (`connect.ts`, `report.ts`, `dir.ts`, `file_info.ts`)
  - Simplified `handlers.ts` to act as a clean dispatcher using a handler registry pattern
  - Refactored `tools.ts` to use array-based tool definitions for consistency
  - Updated `server.ts` to use the new handler dispatcher
  - Improved code organization with better separation of concerns
  - Enhanced error handling and validation in individual tool handlers
  - Added connection state management helper functions

### Added
- **Prompts array support**: Added prompts capability following MikroTik MCP server pattern
  - Implemented `prompts/list` request handler for better tool discoverability
  - Added prompts for all available tools: `qnap-connect`, `qnap-report`, `qnap-dir`, `qnap-file-info`
  - Enhanced server capabilities to include prompts interface

## [1.0.0] - 2026-01-27

### Added
- Initial implementation of the QNAP MCP server.
- Tools: `qnap-connect`, `qnap-report`, `qnap-dir`, `qnap-file-info`.
- Support for QTS Legacy CGI API.

