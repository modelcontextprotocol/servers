"""Utility functions for the Sentry server."""

import json
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

def log_response(response: httpx.Response, context: str = "") -> None:
    """Helper function to log API response details"""
    try:
        logger.debug(f"{context} API Request URL: {response.request.url}")
        logger.debug(f"{context} API Request Headers: {response.request.headers}")
        logger.debug(f"{context} API Response Status: {response.status_code}")
        logger.debug(f"{context} API Response Headers: {response.headers}")
        
        # Try to parse and log response content
        try:
            content = response.json()
            logger.debug(f"{context} API Response Content: {json.dumps(content, indent=2)}")
        except json.JSONDecodeError:
            logger.debug(f"{context} API Response Content (raw): {response.text}")
    except Exception as e:
        logger.error(f"Error logging response: {str(e)}")

def create_stacktrace(data: dict[str, Any]) -> str | None:
    """Create a formatted stacktrace from event data"""
    try:
        for entry in data.get("entries", []):
            if entry["type"] == "exception":
                frames = []
                for exc in entry.get("data", {}).get("values", []):
                    frames.extend(
                        f"{frame.get('filename', 'unknown')}:{frame.get('lineNo', '?')} "
                        f"in {frame.get('function', 'unknown')}"
                        for frame in exc.get("stacktrace", {}).get("frames", [])
                    )
                return "\n".join(frames)
    except Exception as e:
        logger.error(f"Error creating stacktrace: {str(e)}")
        return None
    return None 