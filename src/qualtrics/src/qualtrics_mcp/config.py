"""Configuración del servidor MCP de Qualtrics."""

import os

from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()


class QualtricsConfig:
    """Configuración para la API de Qualtrics."""

    def __init__(self, api_token: str, data_center: str):
        """
        Inicializa la configuración de Qualtrics.

        Args:
            api_token: Token de API de Qualtrics
            data_center: Centro de datos (ej: 'ca1', 'sjc1', 'fra1', etc.)
        """
        self.api_token = api_token
        self.data_center = data_center
        self.base_url = f"https://{data_center}.qualtrics.com/API/v3"
        self.headers = {"X-API-TOKEN": api_token, "Content-Type": "application/json"}

    def __repr__(self) -> str:
        """Representación segura de la configuración (sin exponer el token)."""
        return f"QualtricsConfig(data_center='{self.data_center}')"


# Variable global para almacenar la configuración
_qualtrics_config: QualtricsConfig | None = None


def get_config() -> QualtricsConfig | None:
    """
    Obtiene la configuración global de Qualtrics.

    Si no está configurada, intenta cargarla desde las variables de entorno.

    Returns:
        Configuración de Qualtrics o None si no está disponible
    """
    global _qualtrics_config

    if _qualtrics_config is None:
        api_token = os.getenv("QUALTRICS_API_TOKEN")
        data_center = os.getenv("QUALTRICS_DATA_CENTER")

        if api_token and data_center:
            _qualtrics_config = QualtricsConfig(api_token, data_center)

    return _qualtrics_config


def set_config(api_token: str, data_center: str) -> QualtricsConfig:
    """
    Establece la configuración global de Qualtrics.

    Args:
        api_token: Token de API de Qualtrics
        data_center: Centro de datos de Qualtrics

    Returns:
        Nueva configuración establecida
    """
    global _qualtrics_config
    _qualtrics_config = QualtricsConfig(api_token, data_center)
    return _qualtrics_config


def clear_config() -> None:
    """Limpia la configuración global."""
    global _qualtrics_config
    _qualtrics_config = None
