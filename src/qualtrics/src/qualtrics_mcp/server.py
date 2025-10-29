"""Servidor MCP principal para Qualtrics."""

import sys
from datetime import datetime
from typing import Any

from fastmcp import FastMCP

from .api.client import QualtricsClient
from .config import set_config
from .tools.distributions import listar_distribuciones_sms
from .tools.libraries import (
    listar_librerias,
    listar_mensajes_libreria,
    obtener_mensaje_libreria,
)
from .tools.surveys import listar_encuestas

# Crear instancia del servidor MCP
mcp = FastMCP("qualtrics-mcp")


@mcp.tool()
def configurar_credenciales(api_token: str, data_center: str) -> dict[str, Any]:
    """Configura las credenciales para la API de Qualtrics."""
    try:
        config = set_config(api_token, data_center)
        try:
            with QualtricsClient(config) as client:
                user_info = client.test_connection()
            return {
                "estado": "configurado",
                "data_center": data_center,
                "conexion_probada": True,
                "usuario": user_info.get("result", {}).get("userId", "desconocido"),
                "mensaje": "Credenciales configuradas y probadas correctamente",
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            from .config import clear_config
            clear_config()
            return {
                "estado": "error",
                "mensaje": f"Error al probar conexión: {str(e)}",
                "timestamp": datetime.now().isoformat(),
            }
    except Exception as e:
        return {
            "estado": "error",
            "mensaje": f"Error al configurar credenciales: {str(e)}",
            "timestamp": datetime.now().isoformat(),
        }


@mcp.tool()
def obtener_librerias() -> dict[str, Any]:
    """Obtiene la lista completa de librerías disponibles en Qualtrics."""
    return listar_librerias()


@mcp.tool()
def obtener_mensajes_libreria(library_id: str) -> dict[str, Any]:
    """Obtiene todos los mensajes de una librería específica de Qualtrics."""
    return listar_mensajes_libreria(library_id)


@mcp.tool()
def obtener_detalle_mensaje(library_id: str, message_id: str) -> dict[str, Any]:
    """Obtiene la información detallada de un mensaje específico de una librería."""
    return obtener_mensaje_libreria(library_id, message_id)


@mcp.tool()
def obtener_encuestas() -> dict[str, Any]:
    """Obtiene la lista completa de encuestas disponibles en Qualtrics."""
    return listar_encuestas()


@mcp.tool()
def obtener_distribuciones_sms(survey_id: str) -> dict[str, Any]:
    """Obtiene la lista de todas las distribuciones SMS para una encuesta específica."""
    return listar_distribuciones_sms(survey_id)


def main() -> None:
    """Función principal para ejecutar el servidor MCP."""
    print("🚀 Iniciando servidor MCP Qualtrics...", file=sys.stderr)
    print("", file=sys.stderr)
    print("📡 Herramientas disponibles:", file=sys.stderr)
    print("  1. configurar_credenciales - Configurar API token y data center", file=sys.stderr)
    print("  2. obtener_librerias - Listar todas las librerías disponibles", file=sys.stderr)
    print("  3. obtener_mensajes_libreria - Listar mensajes de una librería", file=sys.stderr)
    print("  4. obtener_detalle_mensaje - Obtener detalles de un mensaje específico", file=sys.stderr)
    print("  5. obtener_encuestas - Listar todas las encuestas con estadísticas", file=sys.stderr)
    print("  6. obtener_distribuciones_sms - Listar distribuciones SMS por encuesta", file=sys.stderr)
    print("", file=sys.stderr)
    print("⏳ Esperando conexiones de clientes MCP...", file=sys.stderr)
    try:
        mcp.run()
    except Exception as e:
        print(f"💥 Error en servidor: {e}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
