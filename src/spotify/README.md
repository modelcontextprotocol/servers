# spotify-mcp MCP server

MCP project to connect Claude with Spotify. Built on top of [spotipy-dev's API](https://github.com/spotipy-dev/spotipy/tree/2.24.0).
A standalone repo for this project can be found at [github.com/varunneal/spotify-mcp](https://github.com/varunneal/spotify-mcp).

## Features
- Start and pause playback
- Search for tracks/albums/artists/playlists
- Get info about a track/album/artist/playlist
- Manage the Spotify queue

## Configuration

### Getting Spotify API Keys
Create an account on [developer.spotify.com](https://developer.spotify.com/). Navigate to [the dashboard](https://developer.spotify.com/dashboard). 
Create an app with redirect_uri as http://localhost:8888. (You can choose any port you want but you must use http and localhost). 
I set `APIs used` to "Web Playback SDK".

### Run this project locally
This project is not yet set up for ephemeral environments (e.g. `uvx` usage). 
Run this project locally by cloning this repo:

```bash
git clone https://github.com/modelcontextprotocol/servers.git
```

You can also clone my fork of `servers`:

```bash
git clone https://github.com/varunneal/servers.git
```

Add this tool (`spotify`) as an MCP server.

On MacOS: `~/Library/Application\ Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`


  ```json
  "spotify": {
      "command": "uv",
      "args": [
        "--directory",
        "/path/to/servers/src/spotify",
        "run",
        "spotify-mcp"
      ],
      "env": {
        "SPOTIFY_CLIENT_ID": YOUR_CLIENT_ID,
        "SPOTIFY_CLIENT_SECRET": YOUR_CLIENT_SECRET,
        "SPOTIFY_REDIRECT_URI": "http://localhost:8888"
      }
    }
  ```
