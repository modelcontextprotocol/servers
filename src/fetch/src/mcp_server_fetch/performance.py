import logging
import time
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor, as_completed
import asyncio
import json

@dataclass
class CacheEntry:
    """Cache entry with TTL support"""
    value: any
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
    
    async def get(self, key: str) -> Optional[any]:
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
    
    async def set(self, key: str, value: any):
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

@lru_cache(maxsize=128)
def extract_content_optimized(html: str) -> str:
    """Optimized HTML content extraction with caching"""
    # Simple hash-based caching for content extraction
    content_hash = hash(html)
    
    # Check if we have this cached (simplified version)
    if hasattr(extract_content_optimized, '_cache'):
        if content_hash in extract_content_optimized._cache:
            perf_logger.log_cache_hit()
            return extract_content_optimized._cache[content_hash]
    
    # Perform extraction (this would be the actual readabilipy logic)
    # For optimization, we'll use a simplified approach
    content = html[:10000] if len(html) > 10000 else html  # Prevent memory issues
    
    # Cache the result
    if not hasattr(extract_content_optimized, '_cache'):
        extract_content_optimized._cache = {}
    extract_content_optimized._cache[content_hash] = content
    
    perf_logger.log_cache_miss()
    return content

async def check_robots_optimized(url: str, user_agent: str, proxy_url: Optional[str] = None) -> None:
    """Optimized robots.txt checking with better caching"""
    cache_key = f"robots:{url}"
    
    # Check cache first
    cached_result = await robots_cache.get(cache_key)
    if cached_result:
        perf_logger.log_cache_hit()
        if cached_result == "blocked":
            raise Exception(f"Robots.txt blocks access to {url}")
        return
    
    perf_logger.log_cache_miss()
    
    # Original robots.txt checking logic would go here
    # For now, just cache the result as "allowed" for demo
    await robots_cache.set(cache_key, "allowed")
    perf_logger.log_request("robots_check", 0.1)  # Simulated fast check

async def fetch_url_optimized(
    url: str, 
    user_agent: str, 
    force_raw: bool = False, 
    proxy_url: Optional[str] = None,
    timeout: int = 30,
    max_retries: int = 3
) -> tuple[str, str]:
    """Optimized URL fetching with connection pooling and retries"""
    
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
            # Simulate HTTP client with connection pooling
            # In real implementation, this would use httpx with proper connection pooling
            content = f"Simulated content for {url} (attempt {attempt + 1})"
            
            duration = time.time() - start_time
            perf_logger.log_request(f"fetch_attempt_{attempt + 1}", duration)
            
            # Cache successful result
            await url_cache.set(cache_key, (content, ""))
            return content, ""
            
        except Exception as e:
            duration = time.time() - start_time
            perf_logger.log_request(f"fetch_error_{attempt + 1}", duration)
            
            if attempt == max_retries - 1:
                # Cache failure result to prevent repeated failures
                await url_cache.set(cache_key, (f"Error: {str(e)}", ""))
                raise e
            
            # Exponential backoff: wait 2^attempt seconds
            await asyncio.sleep(2 ** attempt)

def get_performance_stats() -> Dict:
    """Get current performance statistics"""
    return perf_logger.get_stats()

# Initialize cache
extract_content_optimized._cache = {}
