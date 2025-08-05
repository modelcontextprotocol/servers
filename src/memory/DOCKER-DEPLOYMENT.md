# Docker Deployment Guide for Enhanced MCP Memory Server

This guide covers deploying the Enhanced MCP Memory Server using Docker.

## Quick Start

### Using Docker Run

```bash
docker run -d \
  --name mcp-memory-enhanced \
  -p 6970:6970 \
  -v /path/to/data:/data \
  -e STORAGE_TYPE=sqlite \
  mcp-memory-enhanced:latest
```

### Using Docker Compose

1. Clone the repository
2. Navigate to the project directory
3. Run:
```bash
docker-compose up -d
```

## Building the Image

### From Repository Root
```bash
docker build -f Dockerfile -t mcp-memory-enhanced:latest .
```

### From Memory Directory (Standalone)
```bash
cd src/memory
docker build -f Dockerfile.standalone -t mcp-memory-enhanced:latest .
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_TYPE` | `sqlite` | Storage backend: `sqlite` or `json` |
| `STORAGE_PATH` | `/data` | Directory for data files |
| `SQLITE_DB_NAME` | `knowledge.db` | SQLite database filename |
| `SQLITE_WAL_MODE` | `true` | Enable Write-Ahead Logging |
| `SQLITE_BUSY_TIMEOUT` | `5000` | SQLite busy timeout (ms) |
| `PORT` | `6970` | Health check server port |
| `LOG_LEVEL` | `info` | Logging level: debug, info, warn, error |
| `MAX_ENTITIES` | `1000000` | Maximum entities allowed |
| `SEARCH_LIMIT` | `1000` | Default search result limit |
| `ENABLE_AUTO_BACKUP` | `true` | Enable automatic backups |
| `BACKUP_INTERVAL` | `86400` | Backup interval in seconds |
| `BACKUP_RETENTION_DAYS` | `7` | Days to retain backups |

### Volume Mounts

- `/data` - Main data directory for persistent storage
- `/backups` - Optional backup directory

## Health Check

The container includes a health check endpoint at `http://localhost:6970/health`

Example response:
```json
{
  "status": "healthy",
  "timestamp": "2025-08-05T03:17:59.243Z",
  "storage": {
    "type": "sqlite",
    "stats": {
      "entityCount": 0,
      "relationCount": 0,
      "observationCount": 0,
      "storageSize": 0
    }
  }
}
```

## UnRAID Deployment

1. Copy `unraid-template.xml` to your UnRAID server
2. In UnRAID web UI, go to Docker → Add Container → Template
3. Select the template file
4. Configure paths and environment variables as needed
5. Apply the container

## Performance Comparison

SQLite backend provides significant performance improvements:
- **Entity Creation**: 247-71,071% faster
- **Search Operations**: 1,537-15,098% faster  
- **Memory Usage**: 79-96% less memory
- **Storage Size**: 30-50% reduction

## Migration from JSON to SQLite

If you have existing JSON data:

```bash
# Run migration tool
docker run --rm \
  -v /path/to/json-data:/source \
  -v /path/to/sqlite-data:/data \
  mcp-memory-enhanced:latest \
  node dist/migrate.js /source/knowledge-graph.jsonl
```

## Monitoring

### Container Logs
```bash
docker logs mcp-memory-enhanced
```

### Health Status
```bash
docker inspect mcp-memory-enhanced --format='{{.State.Health.Status}}'
```

### Resource Usage
```bash
docker stats mcp-memory-enhanced
```

## Troubleshooting

### Container Won't Start
- Check logs: `docker logs mcp-memory-enhanced`
- Verify port 6970 is not in use: `netstat -tlnp | grep 6970`
- Ensure data directory has proper permissions

### SQLite Errors
- Verify SQLite libraries are installed in container
- Check disk space in data volume
- Review SQLite busy timeout settings

### Performance Issues
- Monitor container resources with `docker stats`
- Consider increasing memory/CPU limits
- Enable WAL mode for SQLite (default)

## Security Considerations

- Container runs as non-root user (nodejs:1001)
- No privileged access required
- Minimal attack surface with Alpine Linux
- Regular security updates via base image updates

## Backup and Recovery

### Manual Backup
```bash
docker exec mcp-memory-enhanced sqlite3 /data/knowledge.db .backup /data/backup.db
```

### Restore from Backup
```bash
docker cp backup.db mcp-memory-enhanced:/data/knowledge.db
docker restart mcp-memory-enhanced
```

## Advanced Configuration

### Custom Build Arguments
```bash
docker build \
  --build-arg NODE_VERSION=20 \
  --build-arg ALPINE_VERSION=3.18 \
  -t mcp-memory-enhanced:custom .
```

### Multi-Architecture Build
```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t mcp-memory-enhanced:multiarch .
```

## Integration with MCP Clients

The server uses stdio transport for MCP communication. To integrate:

1. Configure your MCP client to use the container
2. Use appropriate stdio communication methods
3. The health endpoint is separate from MCP protocol

## Support

- GitHub Issues: [Create an issue](https://github.com/JamesPrial/mcp-memory-enhanced/issues)
- Documentation: See README.md and README-ENHANCED.md
- MCP Protocol: [modelcontextprotocol.io](https://modelcontextprotocol.io)