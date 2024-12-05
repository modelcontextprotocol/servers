# Amazon Fresh MCP Server

An MCP server implementation that integrates the Amazon Fresh API, letting claude help you shop for groceries.

## Features

**Create a shopping list** - Use claude to create a shopping list based on a recipe or a list of ingredients.

## Tools

- **create_amazon_fresh_link**
  - Create a shopping list based on a recipe or a list of ingredients.
  - Inputs:
    - `shopping_list` (object): A shopping list object.
      - `ingredients` (array): A list of ingredient objects.
        - `name` (string): The name of the ingredient.
        - `quantityList` (array): A list of quantity objects.
          - `unit` (string): The unit of the quantity.
          - `amount` (number): The amount of the quantity.
        - `brand` (string): The brand of the ingredient.
        - `asinOverride` (string): The ASIN of the ingredient.

## Configuration

### Usage with Claude Desktop
Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "amazon-fresh": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-amazon-fresh"
      ],
    }
  }
}
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
