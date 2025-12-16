# Selenium MCP Server

<!-- mcp-name: io.github.krishnapollu/selenium-mcp-server -->

A Model Context Protocol server that provides comprehensive browser automation capabilities through Selenium WebDriver. This server enables LLMs to control web browsers, interact with web elements, capture screenshots, and perform complex web automation tasks.

> [!NOTE]
> This server requires Python 3.10+ and browser drivers (automatically managed by Selenium Manager for Chrome/Firefox).

The Selenium MCP server provides 21+ tools for complete browser automation, from basic navigation to advanced interactions like drag-and-drop, file uploads, and JavaScript execution.

### Available Tools

#### Session Management

- `start_browser` - Launch a new browser session
  - `browser` (string, optional): Browser type - "chrome" or "firefox" (default: "chrome")
  - `options` (object, optional): Browser options
    - `headless` (boolean): Run in headless mode (default: false)
    - `window_size` (string): Window size like "1920x1080"
    - `incognito` (boolean): Use incognito/private mode
    - `disable_gpu` (boolean): Disable GPU acceleration

- `list_sessions` - List all active browser sessions
- `switch_session` - Switch to a different session
  - `session_id` (string, required): Target session ID
- `close_session` - Close a browser session
  - `session_id` (string, required): Session to close

#### Navigation & Page Info

- `navigate` - Navigate to a URL
  - `url` (string, required): Target URL
  - `wait_for_load` (boolean, optional): Wait for page load (default: true)

- `get_page_info` - Get current page information
  - `include_title` (boolean, optional): Include page title
  - `include_url` (boolean, optional): Include current URL
  - `include_source` (boolean, optional): Include HTML source

#### Element Finding & Interaction

- `find_element` - Locate an element on the page
  - `by` (string, required): Selector type - "css", "xpath", "id", "name", "class", "tag"
  - `value` (string, required): Selector value
  - `timeout` (integer, optional): Wait timeout in milliseconds (default: 5000)

- `click_element` - Click an element
  - `by` (string, required): Selector type
  - `value` (string, required): Selector value
  - `force_click` (boolean, optional): Use JavaScript click if normal click fails

- `double_click` - Double click an element
  - `by` (string, required): Selector type
  - `value` (string, required): Selector value

- `right_click` - Right-click (context menu) an element
  - `by` (string, required): Selector type
  - `value` (string, required): Selector value

#### Keyboard & Input

- `send_keys` - Type text into an element
  - `by` (string, required): Selector type
  - `value` (string, required): Selector value
  - `text` (string, required): Text to type
  - `clear_first` (boolean, optional): Clear existing text first (default: false)

- `press_key` - Press a special key
  - `key` (string, required): Key name (Enter, Tab, Escape, ArrowUp, etc.)

#### Advanced Interactions

- `hover` - Hover mouse over an element
  - `by` (string, required): Selector type
  - `value` (string, required): Selector value

- `drag_and_drop` - Drag and drop element
  - `by` (string, required): Source selector type
  - `value` (string, required): Source selector value
  - `targetBy` (string, required): Target selector type
  - `targetValue` (string, required): Target selector value

- `upload_file` - Upload a file
  - `by` (string, required): Selector type (usually input[type="file"])
  - `value` (string, required): Selector value
  - `filePath` (string, required): Absolute path to file

#### Waiting & Timing

- `wait_for_element` - Wait for element to appear
  - `by` (string, required): Selector type
  - `value` (string, required): Selector value
  - `wait_for_visible` (boolean, optional): Wait for visibility (default: true)
  - `timeout` (integer, optional): Timeout in milliseconds (default: 10000)

#### Screenshot & Data Extraction

- `take_screenshot` - Capture screenshot
  - `full_page` (boolean, optional): Capture full page (default: true)
  - `filename` (string, optional): Save filename

- `get_element_text` - Get text content of element
  - `by` (string, required): Selector type
  - `value` (string, required): Selector value

#### JavaScript Execution

- `execute_script` - Execute JavaScript in browser
  - `script` (string, required): JavaScript code to execute

#### Server Info

- `get_server_version` - Get server version information

## Installation

### Using pip (recommended)

Install the Selenium MCP server via pip:

```bash
pip install selenium-mcp-server
```

The server will automatically manage browser drivers through Selenium Manager. No manual driver installation required.

### Manual Installation

```bash
git clone https://github.com/krishnapollu/selenium-mcp-server.git
cd selenium-mcp-server
pip install -e .
```

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

#### macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

#### Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "selenium": {
      "command": "python",
      "args": ["-m", "selenium_mcp_server"],
      "env": {
        "SELENIUM_BROWSER": "chrome",
        "SELENIUM_HEADLESS": "false"
      }
    }
  }
}
```

### VS Code with MCP Extension

Add to VS Code settings (`settings.json`):

```json
{
  "mcp.servers": {
    "selenium": {
      "command": "python",
      "args": ["-m", "selenium_mcp_server"],
      "env": {
        "SELENIUM_BROWSER": "chrome",
        "SELENIUM_HEADLESS": "false"
      }
    }
  }
}
```

Or install the VS Code extension:

- Extension ID: `krishnapollu.selenium-mcp-server`
- Marketplace: [Selenium MCP Server](https://marketplace.visualstudio.com/items?itemName=krishnapollu.selenium-mcp-server)

### Cline

Add to Cline MCP settings:

```json
{
  "mcpServers": {
    "selenium": {
      "command": "python",
      "args": ["-m", "selenium_mcp_server"]
    }
  }
}
```

## Usage Examples

### Basic Navigation

```
Prompt: "Open Chrome, navigate to https://github.com, and take a screenshot"
```

The LLM will execute:

1. `start_browser` with chrome
2. `navigate` to the URL
3. `take_screenshot` of the page

### Form Automation

```
Prompt: "Go to https://example.com/login, fill in username 'testuser' 
and password 'testpass', then click the login button"
```

The LLM will execute:

1. `navigate` to login page
2. `send_keys` for username field
3. `send_keys` for password field  
4. `click_element` on login button
5. `wait_for_element` for dashboard/success indicator

### Web Scraping

```
Prompt: "Extract all product titles from https://example.com/products"
```

The LLM will execute:

1. `navigate` to products page
2. `find_element` for product containers
3. `get_element_text` for each title
4. Return collected data

### File Upload

```
Prompt: "Upload the file C:/Users/Documents/report.pdf to 
https://example.com/upload"
```

The LLM will execute:

1. `navigate` to upload page
2. `upload_file` with the specified path
3. `click_element` on submit button
4. `wait_for_element` for confirmation

### Dynamic Content Testing

```
Prompt: "Test infinite scroll on https://example.com/feed by scrolling 
3 times and counting loaded items"
```

The LLM will execute:

1. `navigate` to feed page
2. `execute_script` to scroll down
3. `wait_for_element` for new content
4. Repeat 3 times
5. `execute_script` to count items
6. `take_screenshot` of final state

## Browser Support

### Chrome (Recommended)

- ✅ Automatic driver management
- ✅ Headless mode
- ✅ Full feature support
- ✅ DevTools Protocol access

### Firefox

- ✅ Automatic driver management
- ✅ Headless mode
- ✅ Most features supported
- ⚠️ Some advanced features limited

### Edge (Experimental)

- ⚠️ Requires manual driver installation
- ⚠️ Limited testing

### Safari (macOS only)

- ⚠️ Requires enabling WebDriver in Safari
- ⚠️ Limited automation capabilities

## Environment Variables

- `SELENIUM_BROWSER` - Default browser ("chrome" or "firefox")
- `SELENIUM_HEADLESS` - Run in headless mode ("true" or "false")
- `SELENIUM_WINDOW_SIZE` - Default window size ("1920x1080")
- `SELENIUM_TIMEOUT` - Default timeout in seconds (default: 30)
- `SELENIUM_LOG_LEVEL` - Logging level ("DEBUG", "INFO", "WARNING", "ERROR")

## Comparison with Playwright MCP

| Feature | Selenium MCP | Playwright MCP |
|---------|--------------|----------------|
| **Browser Support** | Chrome, Firefox, Edge, Safari | Chromium, Firefox, WebKit |
| **Driver Management** | Automatic (Selenium Manager) | Built-in |
| **Headless Mode** | ✅ Yes | ✅ Yes |
| **Screenshots** | ✅ Yes | ✅ Yes |
| **Network Interception** | ⚠️ Limited | ✅ Advanced |
| **Multi-tab** | ✅ Yes | ✅ Yes |
| **Mobile Emulation** | ⚠️ Basic | ✅ Advanced |
| **JavaScript Execution** | ✅ Yes | ✅ Yes |
| **File Upload** | ✅ Yes | ✅ Yes |
| **Drag & Drop** | ✅ Yes | ✅ Yes |
| **Best For** | Traditional web apps, legacy browser support | Modern web apps, advanced testing |

## Troubleshooting

### Browser Not Starting

**Issue**: Browser fails to launch

**Solution**:

```bash
# Verify Selenium installation
python -c "import selenium; print(selenium.__version__)"

# Test driver download
python -c "from selenium import webdriver; webdriver.Chrome()"

# Check browser installation
which google-chrome  # Linux/macOS
where chrome.exe     # Windows
```

### Element Not Found

**Issue**: `find_element` fails

**Solution**:

1. Use `wait_for_element` before interaction
2. Try different selector types (css, xpath, id)
3. Increase timeout value
4. Check if element is in iframe: use `switch_to.frame()` in JS

### Screenshots Empty

**Issue**: Screenshots are blank

**Solution**:

```json
// Wait for content to load
{
  "name": "wait_for_element",
  "arguments": {
    "by": "css",
    "value": "body",
    "wait_for_visible": true,
    "timeout": 5000
  }
}
```

### Permission Denied (File Upload)

**Issue**: Cannot upload file

**Solution**:

- Use absolute paths (not relative)
- Check file permissions
- Verify file exists before upload

## Security Considerations

> [!CAUTION]
> This server can interact with any website and execute JavaScript. Use appropriate security measures:
>
> - Validate URLs before navigation
> - Sanitize user input for selectors
> - Limit file upload paths
> - Run in isolated environment for untrusted operations
> - Use headless mode for server deployments
> - Monitor and log all browser actions

## Performance Tips

1. **Use headless mode** for faster execution:

   ```json
   {"browser": "chrome", "options": {"headless": true}}
   ```

2. **Set appropriate timeouts** to avoid long waits:

   ```json
   {"timeout": 3000}  // 3 seconds instead of default 5
   ```

3. **Reuse sessions** instead of creating new ones:

   ```json
   {"name": "switch_session", "arguments": {"session_id": "existing-id"}}
   ```

4. **Use CSS selectors** (faster than XPath):

   ```json
   {"by": "css", "value": "#element-id"}  // Fast
   {"by": "xpath", "value": "//div[@id='element-id']"}  // Slower
   ```

5. **Disable images** for faster page loads:

   ```json
   {
     "options": {
       "preferences": {
         "profile.managed_default_content_settings.images": 2
       }
     }
   }
   ```

## Contributing

Contributions are welcome! Please see the [CONTRIBUTING.md](https://github.com/krishnapollu/selenium-mcp-server/blob/main/CONTRIBUTING.md) for guidelines.

## License

This MCP server is licensed under the MIT License. See [LICENSE](https://github.com/krishnapollu/selenium-mcp-server/blob/main/LICENSE) for details.

## Links

- **GitHub Repository**: <https://github.com/krishnapollu/selenium-mcp-server>
- **PyPI Package**: <https://pypi.org/project/selenium-mcp-server/>
- **VS Code Extension**: <https://marketplace.visualstudio.com/items?itemName=krishnapollu.selenium-mcp-server>
- **Selenium Documentation**: <https://www.selenium.dev/documentation/>
- **Model Context Protocol**: <https://modelcontextprotocol.io/>

## Support

For issues, questions, or feature requests:

- GitHub Issues: <https://github.com/krishnapollu/selenium-mcp-server/issues>
- MCP Community: <https://github.com/modelcontextprotocol/community>
