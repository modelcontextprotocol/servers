# Google Maps MCP Server

MCP Server for the Google Maps API.

## Tools

1. `maps_geocode`
   - Convert address to coordinates
   - Input: `address` (string)
   - Returns: location, formatted_address, place_id

2. `maps_reverse_geocode`
   - Convert coordinates to address
   - Inputs:
     - `latitude` (number)
     - `longitude` (number)
   - Returns: formatted_address, place_id, address_components

3. `maps_search_places`
   - Search for places using text query
   - Inputs:
     - `query` (string)
     - `location` (optional): { latitude: number, longitude: number }
     - `radius` (optional): number (meters, max 50000)
   - Returns: array of places with names, addresses, locations

4. `maps_place_details`
   - Get detailed information about a place
   - Input: `place_id` (string)
   - Returns: name, address, contact info, ratings, reviews, opening hours

5. `maps_distance_matrix`
   - Calculate distances and times between points
   - Inputs:
     - `origins` (string[])
     - `destinations` (string[])
     - `mode` (optional): "driving" | "walking" | "bicycling" | "transit"
   - Returns: distances and durations matrix

6. `maps_elevation`
   - Get elevation data for locations
   - Input: `locations` (array of {latitude, longitude})
   - Returns: elevation data for each point

7. `maps_directions`
   - Get directions between points
   - Inputs:
     - `origin` (string)
     - `destination` (string)
     - `mode` (optional): "driving" | "walking" | "bicycling" | "transit"
   - Returns: route details with steps, distance, duration

## Setup

### API Key
Get a Google Maps API key by following the instructions [here](https://developers.google.com/maps/documentation/javascript/get-api-key#create-api-keys).

### Usage with Claude Desktop

Add the following to your `claude_desktop_config.json`:

#### Docker

```json
{
  "mcpServers": {
    "google-maps": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "GOOGLE_MAPS_API_KEY",
        "mcp/google-maps"
      ],
      "env": {
        "GOOGLE_MAPS_API_KEY": "<YOUR_API_KEY>"
      }
    }
  }
}
```

### NPX

```json
{
  "mcpServers": {
    "google-maps": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-google-maps"
      ],
      "env": {
        "GOOGLE_MAPS_API_KEY": "<YOUR_API_KEY>"
      }
    }
  }
}
```

## Build

Docker build:

```bash
docker build -t mcp/google-maps -f src/google-maps/Dockerfile .
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
