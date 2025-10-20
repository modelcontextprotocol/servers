# Qualtrics MCP Server

Un servidor Model Context Protocol (MCP) para integración con la API de Qualtrics, permitiendo a los modelos de IA como Claude interactuar con encuestas, librerías, mensajes y distribuciones SMS de Qualtrics.

## Características

- **6 Herramientas MCP** para gestionar Qualtrics:
  1. `configurar_credenciales` - Configurar API token y data center
  2. `obtener_librerias` - Listar librerías disponibles
  3. `obtener_mensajes_libreria` - Listar mensajes de una librería
  4. `obtener_detalle_mensaje` - Obtener detalles de mensaje específico
  5. `obtener_encuestas` - Listar encuestas con estadísticas
  6. `obtener_distribuciones_sms` - Listar distribuciones SMS por encuesta

- Cliente HTTP asíncrono con paginación automática
- Manejo robusto de errores
- Type hints completos
- Arquitectura modular

## Instalación

### Opción 1: Desde el código fuente

```bash
git clone https://github.com/EderBuug/qualtrics-mcp.git
cd qualtrics-mcp
uv sync
```

### Opción 2: Desde PyPI (próximamente)

```bash
pip install qualtrics-mcp
```

## Configuración

### 1. Obtener credenciales de Qualtrics

1. Inicia sesión en Qualtrics
2. Ve a **Account Settings** → **Qualtrics IDs**
3. Genera un **API Token**
4. Identifica tu **Data Center** (ej: `ca1`, `sjc1`, `fra1`)

### 2. Configurar Claude Desktop

Edita `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "qualtrics": {
      "command": "uv",
      "args": [
        "--directory",
        "/path/to/qualtrics-mcp",
        "run",
        "python",
        "main.py"
      ],
      "env": {
        "QUALTRICS_API_TOKEN": "your_token_here",
        "QUALTRICS_DATA_CENTER": "ca1"
      }
    }
  }
}
```

## Uso

Una vez configurado en Claude Desktop, podrás:

- Gestionar librerías y mensajes de Qualtrics
- Listar y analizar encuestas
- Consultar distribuciones SMS
- Todo con procesamiento inteligente de datos

## Repositorio

**Código fuente completo:** https://github.com/EderBuug/qualtrics-mcp

## Licencia

MIT License - ver LICENSE para más detalles

## Autor

Eder Vázquez Vázquez (@EderBuug)
