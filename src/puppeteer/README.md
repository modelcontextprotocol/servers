      "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
    }
  }
}
```

## Error Handling

The server includes comprehensive error handling:

- Automatic browser reconnection on disconnection
- Operation timeouts with configurable limits
- Detailed error messages for failed operations
- Graceful cleanup on process termination
- Unhandled rejection catching

## Resource Management

The server implements several resource management features:

- Automatic browser cleanup on shutdown
- Memory leak prevention
- Screenshot storage management
- Console log buffering

## Browser Recovery

The server includes automatic recovery mechanisms:

- Reconnection on browser crashes
- Page recreation on navigation errors
- Connection state verification
- Graceful error handling during recovery

## Development

### Prerequisites

- Node.js 16 or higher
- npm or yarn

### Installation

```bash
npm install @modelcontextprotocol/server-puppeteer
```

### Development Commands

```bash
# Build the project
npm run build

# Run in watch mode
npm run watch

# Run tests
npm run test

# Lint the code
npm run lint

# Format the code
npm run format
```

## Troubleshooting

### Common Issues

1. **Browser Launch Fails**
   - Check system dependencies
   - Verify sufficient memory
   - Check browser executable permissions

2. **Navigation Timeout**
   - Increase timeout in configuration
   - Check network connectivity
   - Verify URL accessibility

3. **Screenshot Fails**
   - Verify element visibility
   - Check viewport dimensions
   - Ensure sufficient memory

4. **Element Interaction Fails**
   - Verify selector correctness
   - Check element visibility and interactability
   - Increase wait timeout if needed

### Debug Logging

To enable debug logging, set the environment variable:

```bash
DEBUG=mcp:puppeteer* npm start
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This MCP server is licensed under the MIT License. See the LICENSE file for details.

## Security

The server implements several security measures:

- Sandboxed browser environment
- Restricted JavaScript execution
- Resource usage limits
- Input validation

Please report security issues to the security contact listed in the repository.

## Versioning

This project follows [Semantic Versioning](https://semver.org/). Release notes can be found in the CHANGELOG.md file.
