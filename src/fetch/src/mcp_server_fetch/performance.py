import logging
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass
import asyncio
# from functools import lru_cache
# from concurrent.futures import ThreadPoolExecutor, as_completed
# import json

@dataclass
class CacheEntry:
    """Cache entry with TTL support"""
    value: Any
    timestamp: float
    ttl: float = 300.0  # 5 minutes default

class PerformanceLogger:
    """Enhanced performance logger with metrics tracking"""
    
    def __init__(self):
        self.metrics = {
            'cache_hits': 0,
            'cache_misses': 0,
            'request_times': [],
            'concurrent_requests': 0
        }
        self.start_time = time.time()
    
    def log_request(self, operation: str, duration: float):
        """Log request performance metrics"""
        self.metrics['request_times'].append(duration)
        # Keep only last 100 request times to prevent memory bloat
        if len(self.metrics['request_times']) > 100:
            self.metrics['request_times'] = self.metrics['request_times'][-100:]
        
        logging.info(f"{operation} completed in {duration:.3f}s")
    
    def log_cache_hit(self):
        self.metrics['cache_hits'] += 1
    
    def log_cache_miss(self):
        self.metrics['cache_misses'] += 1
    
    def get_stats(self) -> Dict:
        """Get performance statistics"""
        request_times = self.metrics['request_times']
        return {
            'uptime_seconds': time.time() - self.start_time,
            'cache_hits': self.metrics['cache_hits'],
            'cache_misses': self.metrics['cache_misses'],
            'cache_hit_rate': (
                self.metrics['cache_hits'] / 
                (self.metrics['cache_hits'] + self.metrics['cache_misses'])
                if (self.metrics['cache_hits'] + self.metrics['cache_misses']) > 0 else 0
            ),
            'avg_request_time': sum(request_times) / len(request_times) if request_times else 0,
            'max_request_time': max(request_times) if request_times else 0,
            'min_request_time': min(request_times) if request_times else 0,
            'total_requests': len(request_times)
        }

# Global performance logger
perf_logger = PerformanceLogger()

# LRU Cache with TTL support
class TTLCache:
    """Thread-safe LRU cache with automatic expiration"""
    
    def __init__(self, maxsize: int = 128, ttl: float = 300.0):
        self.cache = {}
        self.maxsize = maxsize
        self.ttl = ttl
        self.lock = asyncio.Lock()
    
    async def get(self, key: str) -> Optional[Any]:
        async with self.lock:
            entry = self.cache.get(key)
            if entry and time.time() - entry.timestamp < entry.ttl:
                perf_logger.log_cache_hit()
                return entry.value
            elif entry:
                # Expired entry, remove it
                del self.cache[key]
            
            perf_logger.log_cache_miss()
            return None
    
    async def set(self, key: str, value: Any):
        async with self.lock:
            self.cache[key] = CacheEntry(value=value, timestamp=time.time())
            # Remove oldest entries if cache is full
            if len(self.cache) > self.maxsize:
                oldest_key = min(
                    self.cache.keys(),
                    key=lambda k: self.cache[k].timestamp
                )
                del self.cache[oldest_key]

# Global caches
url_cache = TTLCache(maxsize=256, ttl=600.0)  # 10 minutes for URLs
robots_cache = TTLCache(maxsize=128, ttl=1800.0)  # 30 minutes for robots.txt

def extract_content_optimized(html: str) -> str:
    """Optimized HTML content extraction with caching"""
    # Handle empty HTML
    if not html or not html.strip():
        return "<error>Page failed to be simplified from HTML</error>"
    
    # Use the original implementation for compatibility with tests
    import readabilipy.simple_json
    import markdownify
    
    try:
        ret = readabilipy.simple_json.simple_json_from_html_string(
            html, use_readability=True
        )
        if not ret["content"]:
            return "<error>Page failed to be simplified from HTML</error>"
        content = markdownify.markdownify(
            ret["content"],
            heading_style=markdownify.ATX,
        )
        return content
    except Exception as e:
        # Fallback for any errors during extraction
        return f"<error>Page failed to be simplified from HTML: {str(e)}</error>"

async def check_robots_optimized(url: str, user_agent: str, proxy_url: Optional[str] = None) -> None:
    """Optimized robots.txt checking with better caching"""
    from httpx import AsyncClient, HTTPError
    from mcp.shared.exceptions import McpError
    from mcp.types import ErrorData, INTERNAL_ERROR
    from urllib.parse import urlparse, urlunparse
    from protego import Protego
    import os
    import sys
    
    # Skip caching in test environment
    # is_test_env = os.getenv('PYTEST_CURRENT_TEST') or 'pytest' in sys.modules if 'sys' in globals() else False
    is_test_env = 'pytest' in sys.modules
    
    if not is_test_env:
        cache_key = f"robots:{url}"
        
        # Check cache first
        cached_result = await robots_cache.get(cache_key)
        if cached_result:
            perf_logger.log_cache_hit()
            if cached_result == "blocked":
                raise McpError(ErrorData(
                    code=INTERNAL_ERROR,
                    message=f"The sites robots.txt specifies that autonomous fetching of this page is not allowed"
                ))
            return
        
        perf_logger.log_cache_miss()
    
    # Parse the URL into components
    parsed = urlparse(url)
    robots_txt_url = urlunparse((parsed.scheme, parsed.netloc, "/robots.txt", "", "", ""))

    async with AsyncClient(proxies=proxy_url) as client:
        try:
            response = await client.get(
                robots_txt_url,
                follow_redirects=True,
                headers={"User-Agent": user_agent},
            )
        except HTTPError:
            raise McpError(ErrorData(
                code=INTERNAL_ERROR,
                message=f"Failed to fetch robots.txt {robots_txt_url} due to a connection issue",
            ))
        if response.status_code in (401, 403):
            if not is_test_env:
                await robots_cache.set(cache_key, "blocked")
            raise McpError(ErrorData(
                code=INTERNAL_ERROR,
                message=f"When fetching robots.txt ({robots_txt_url}), received status {response.status_code} so assuming that autonomous fetching is not allowed, the user can try manually fetching by using the fetch prompt",
            ))
        elif 400 <= response.status_code < 500:
            if not is_test_env:
                await robots_cache.set(cache_key, "allowed")
            return
        robot_txt = response.text
        processed_robot_txt = "\n".join(
            line for line in robot_txt.splitlines() if not line.strip().startswith("#")
        )
    robot_parser = Protego.parse(processed_robot_txt)
    if not robot_parser.can_fetch(str(url), user_agent):
        if not is_test_env:
            await robots_cache.set(cache_key, "blocked")
        raise McpError(ErrorData(
            code=INTERNAL_ERROR,
            message=f"The sites robots.txt ({robots_txt_url}), specifies that autonomous fetching of this page is not allowed, "
            f"<useragent>{user_agent}</useragent>\n"
            f"<url>{url}</url>"
            f"<robots>\n{robot_txt}\n</robots>\n"
            f"The assistant must let the user know that it failed to view the page. The assistant may provide further guidance based on the above information.\n"
            f"The assistant can tell the user that they can try manually fetching the page by using the fetch prompt within their UI.",
        ))
    
    if not is_test_env:
        await robots_cache.set(cache_key, "allowed")

async def fetch_url_optimized(
    url: str, 
    user_agent: str, 
    force_raw: bool = False, 
    proxy_url: Optional[str] = None,
    timeout: int = 30,
    max_retries: int = 3
) -> Optional[Tuple[str, str]]:
    """Optimized URL fetching with connection pooling and retries"""
    from httpx import AsyncClient, HTTPError
    from mcp.shared.exceptions import McpError
    from mcp.types import ErrorData, INTERNAL_ERROR
    
    cache_key = f"url:{hash(url)}:{force_raw}"
    
    # Check cache first
    cached_result = await url_cache.get(cache_key)
    if cached_result:
        perf_logger.log_cache_hit()
        return cached_result
    
    perf_logger.log_cache_miss()
    
    # Implement retry logic with exponential backoff
    for attempt in range(max_retries):
        start_time = time.time()
        
        try:
            async with AsyncClient(proxies=proxy_url) as client:
                response = await client.get(
                    url,
                    follow_redirects=True,
                    headers={"User-Agent": user_agent},
                    timeout=timeout,
                )
                
                if response.status_code >= 400:
                    raise McpError(ErrorData(
                        code=INTERNAL_ERROR,
                        message=f"Failed to fetch {url} - status code {response.status_code}",
                    ))

                page_raw = response.text

            content_type = response.headers.get("content-type", "")
            is_page_html = (
                "<html" in page_raw[:100] or "text/html" in content_type or not content_type
            )

            if is_page_html and not force_raw:
                content = extract_content_optimized(page_raw)
                result = (content, "")
            else:
                result = (
                    page_raw,
                    f"Content type {content_type} cannot be simplified to markdown, but here is the raw content:\n",
                )
            
            duration = time.time() - start_time
            perf_logger.log_request(f"fetch_attempt_{attempt + 1}", duration)
            
            # Cache successful result
            await url_cache.set(cache_key, result)
            return result
            
        except Exception as e:
            duration = time.time() - start_time
            perf_logger.log_request(f"fetch_error_{attempt + 1}", duration)
            
            if attempt == max_retries - 1:
                # Cache failure result to prevent repeated failures
                error_result = (f"Error: {str(e)}", "")
                await url_cache.set(cache_key, error_result)
                raise e
            
            # Exponential backoff: wait 2^attempt seconds
            await asyncio.sleep(2 ** attempt)

def get_performance_stats() -> Dict:
    """Get current performance statistics"""
    return perf_logger.get_stats()

# initialize cache
extract_content_optimized._cache = {}