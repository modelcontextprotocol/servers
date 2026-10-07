import os
from unittest.mock import patch

import httpx
import pytest

from mcp_server_exogram.server import (
    exogram_commit_action,
    exogram_evaluate_action,
    exogram_search_records,
    exogram_store_record,
    get_headers,
)


@pytest.fixture(autouse=True)
def mock_env():
    with patch.dict(os.environ, {"EXOGRAM_BEARER_TOKEN": "test-token", "EXOGRAM_API_URL": "https://test.api"}):
        yield


def test_get_headers_missing_token():
    with patch.dict(os.environ, clear=True):
        with pytest.raises(ValueError, match="EXOGRAM_BEARER_TOKEN environment variable is missing"):
            get_headers()


def test_get_headers_success():
    headers = get_headers()
    assert headers["Authorization"] == "Bearer test-token"
    assert headers["Content-Type"] == "application/json"


@patch("mcp_server_exogram.server.httpx.Client.post")
def test_evaluate_action_success(mock_post):
    mock_post.return_value.status_code = 200
    mock_post.return_value.json.return_value = {"token": "test-eval-token"}
    
    result = exogram_evaluate_action("test_action", "default", "agent-1", '{"key": "value"}')
    assert "STATUS: ALLOWED. Execution Token Issued: test-eval-token" in result


@patch("mcp_server_exogram.server.httpx.Client.post")
def test_evaluate_action_403(mock_post):
    mock_post.return_value.status_code = 403
    mock_post.return_value.text = "Forbidden action"
    
    result = exogram_evaluate_action("test_action", "default", "agent-1", '{"key": "value"}')
    assert "STATUS: BLOCKED. Policy violation: Forbidden action" in result


@patch("mcp_server_exogram.server.httpx.Client.post")
def test_evaluate_action_network_error(mock_post):
    mock_post.side_effect = httpx.RequestError("Network error")
    
    result = exogram_evaluate_action("test_action", "default", "agent-1", "{}")
    assert "STATUS: NETWORK FAILURE" in result


@patch("mcp_server_exogram.server.httpx.Client.post")
def test_commit_action_success(mock_post):
    mock_post.return_value.status_code = 200
    mock_post.return_value.text = "OK"
    
    result = exogram_commit_action("test-eval-token", "success")
    assert "STATUS: COMMITTED" in result
    assert "OK" in result


@patch("mcp_server_exogram.server.httpx.Client.post")
def test_commit_action_error(mock_post):
    mock_post.return_value.status_code = 500
    mock_post.return_value.text = "Internal Error"
    
    result = exogram_commit_action("test-eval-token", "failure")
    assert "STATUS: COMMIT ERROR. Code 500" in result


@patch("mcp_server_exogram.server.httpx.Client.post")
def test_store_record_success(mock_post):
    mock_post.return_value.status_code = 200
    mock_post.return_value.json.return_value = {"memory_id": "mem-123", "conflicts_detected": 1}
    
    result = exogram_store_record("User likes test")
    assert "STATUS: STORED. Record ID: mem-123 | 1 conflict(s) detected" in result


@patch("mcp_server_exogram.server.httpx.Client.post")
def test_store_record_429(mock_post):
    mock_post.return_value.status_code = 429
    mock_post.return_value.text = "Too many requests"
    
    result = exogram_store_record("User likes test")
    assert "STATUS: RATE LIMITED. Too many requests" in result


@patch("mcp_server_exogram.server.httpx.Client.post")
def test_search_records_success(mock_post):
    mock_post.return_value.status_code = 200
    mock_post.return_value.json.return_value = {
        "results": [
            {"content": "Match 1", "score": 0.95},
            {"content": "Match 2", "score": 0.85}
        ]
    }
    
    result = exogram_search_records("test query")
    assert "Found 2 matching records:" in result
    assert "[0.95] Match 1" in result
    assert "[0.85] Match 2" in result


@patch("mcp_server_exogram.server.httpx.Client.post")
def test_search_records_empty(mock_post):
    mock_post.return_value.status_code = 200
    mock_post.return_value.json.return_value = {"results": []}
    
    result = exogram_search_records("test query")
    assert "No matching records found." in result
