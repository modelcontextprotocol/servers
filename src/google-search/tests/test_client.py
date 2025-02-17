import asyncio
import os
import unittest

import pytest
from dotenv import load_dotenv
from pydantic import SecretStr
from src.mcp_server_googlesearch.client import CustomGoogleSearchClient

load_dotenv()


def check_env_vars():
    if os.environ["GOOGLE_API_KEY"] and os.environ["GOOGLE_CSE_ID"]:
        return True
    return False


class TestCustomGoogleSearchClient(unittest.TestCase):
    """Test the CustomGoogleSearchClient."""

    @pytest.mark.skipif(
        not check_env_vars(), reason="GOOGLE_API_KEY and GOOGLE_CSE_ID must be set"
    )
    def test_search(self):
        client = CustomGoogleSearchClient(
            google_api_key=SecretStr(os.environ["GOOGLE_API_KEY"]),
            google_cse_id=SecretStr(os.environ["GOOGLE_CSE_ID"]),
        )
        results = asyncio.run(client.search(query="mcp server", num=5))
        for result in results:
            self.assertIsNotNone(result.title)
            self.assertIsNotNone(result.link)
            self.assertIsNotNone(result.snippet)
