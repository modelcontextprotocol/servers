"""SQLite MCP UTF-8 Encoding Fix

This module fixes UTF-8 encoding issues on Windows by ensuring proper 
stream encoding configuration.
"""

import sys
import codecs

def configure_utf8_encoding():
    """Configure UTF-8 encoding for stdin/stdout on Windows."""
    if sys.platform == 'win32':
        # Set up UTF-8 encoding for stdout/stderr
        sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer)
        sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer)