import logging
from enum import Enum

import httpx
from dotenv import load_dotenv
from httpx import HTTPError, HTTPStatusError, Timeout
from mcp import McpError
from pydantic import AnyUrl

load_dotenv()
logger = logging.getLogger(__name__)

APP_NAME = "mcp_server_rememberizer"
ACCOUNT_INFORMATION_PATH = "account/"
LIST_DOCUMENTS_PATH = "documents/"
RETRIEVE_DOCUMENT_PATH = "documents/{id}/contents/"
RETRIEVE_SLACK_PATH = "discussions/{id}/contents/?integration_type=slack"
SEARCH_PATH = "documents/search/"
AGENTIC_SEARCH_PATH = "documents/agentic_search/"
LIST_INTEGRATIONS_PATH = "integrations/"


class RememberizerTools(Enum):
    SEARCH = "rememberizer_search"
    AGENTIC_SEARCH = "rememberizer_agentic_search"
    LIST_INTEGRATIONS = "rememberizer_list_integrations"
    ACCOUNT_INFORMATION = "rememberizer_account_information"
    LIST_DOCUMENTS = "rememberizer_list_documents"


class APIClient:
    def __init__(self, base_url: str, api_key: str):
        self.http_client = httpx.AsyncClient(
            base_url=base_url,
            timeout=Timeout(connect=60.0, read=60.0, write=5.0, pool=5.0),
            headers={
                "Content-Type": "application/json",
                "X-API-Key": api_key,
            },
        )

    async def get(self, path: str, params: dict = None):
        try:
            logger.debug(f"Fetching {path}")
            response = await self.http_client.get(path, params=params)
            if response.status_code == 401:
                raise McpError(
                    "Error: Unauthorized. Please check your REMEMBERIZER API token"
                )
            response.raise_for_status()
            return response.json()
        except HTTPStatusError as exc:
            logger.error(
                f"HTTP {exc.response.status_code} error while fetching {path}: {str(exc)}",
                exc_info=True,
            )
            raise McpError(
                f"Failed to fetch {path}. Status: {exc.response.status_code}"
            )
        except HTTPError as exc:
            logger.error(
                f"Connection error while fetching {path}: {str(exc)}", exc_info=True
            )
            raise McpError(f"Failed to fetch {path}. Connection error.")

    async def post(self, path, data: dict, params: dict = None):
        try:
            logger.debug(f"Posting to {path}")
            response = await self.http_client.post(path, json=data, params=params)
            if response.status_code == 401:
                raise McpError(
                    "Error: Unauthorized. Please check your REMEMBERIZER API token"
                )
            response.raise_for_status()
            return response.json()
        except HTTPStatusError as exc:
            logger.error(
                f"HTTP {exc.response.status_code} error while posting to {path}: {str(exc)}",
                exc_info=True,
            )
            raise McpError(
                f"Failed to post to {path}. Status: {exc.response.status_code}"
            )
        except HTTPError as exc:
            logger.error(
                f"Connection error while posting to {path}: {str(exc)}", exc_info=True
            )
            raise McpError(f"Failed to post to {path}. Connection error.")


def get_document_uri(document):
    host = "slack" if document["integration_type"] == "slack" else "document"
    return AnyUrl(f"rememberizer://{host}/{document['pk']}")
