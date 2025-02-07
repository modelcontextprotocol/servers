# Contributing to MCP Servers

Thank you for your interest in contributing to the Model Context Protocol (MCP) servers! This document provides guidelines and instructions for contributing.

## Types of Contributions

### 1. New Servers

The repository contains reference implementations, as well as a list of community servers.
We generally don't accept new servers into the repository. We do accept pull requests to the [README.md](./README.md)
adding a reference to your servers.

Please keep lists in alphabetical order to minimize merge conflicts when adding new items.

- Check the [modelcontextprotocol.io](https://modelcontextprotocol.io) documentation
- Ensure your server doesn't duplicate existing functionality
- Consider whether your server would be generally useful to others
- Follow [security best practices](https://modelcontextprotocol.io/docs/concepts/transports#security-considerations) from the MCP documentation
- Create a PR adding a link to your server to the [README.md](./README.md).

### 2. Improvements to Existing Servers
Enhancements to existing servers are welcome! This includes:

- Bug fixes
- Performance improvements
- New features
- Security enhancements

### 3. Documentation
Documentation improvements are always welcome:

- Fixing typos or unclear instructions
- Adding examples
- Improving setup instructions
- Adding troubleshooting guides

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/servers.git
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/modelcontextprotocol/servers.git
   ```
4. Create a branch:
   ```bash
   git checkout -b my-feature
   ```

## Development Guidelines

### Code Style
- Follow the existing code style in the repository
- Include appropriate type definitions
- Add comments for complex logic

### Documentation
- Include a detailed README.md in your server directory
- Document all configuration options
- Provide setup instructions
- Include usage examples

### Security
- Follow security best practices
- Implement proper input validation
- Handle errors appropriately
- Document security considerations

## Submitting Changes

1. Commit your changes:
   ```bash
   git add .
   git commit -m "Description of changes"
   ```
2. Push to your fork:
   ```bash
   git push origin my-feature
   ```
3. Create a Pull Request through GitHub

### Pull Request Guidelines

- Thoroughly test your changes
- Fill out the pull request template completely
- Link any related issues
- Provide clear description of changes
- Include any necessary documentation updates
- Add screenshots for UI changes
- List any breaking changes

## Community

- Participate in [GitHub Discussions](https://github.com/orgs/modelcontextprotocol/discussions)
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md)

## Questions?

- Check the [documentation](https://modelcontextprotocol.io)
- Ask in GitHub Discussions

Thank you for contributing to MCP Servers!
