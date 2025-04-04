/**
 * Example usage of enhanced error handling features
 */

import { makeRetryable, DEFAULT_RETRY_CONFIG, CircuitBreakerWrapped, CircuitBreakerOptions } from './retry.js';
import { ApiError, createCircuitBreaker, ErrorType, ErrorSeverity } from './errors.js';

interface ApiResponse {
  data: any;
  status: number;
}

// Example API call function that matches the expected signature
async function fetchData(...args: [string]): Promise<ApiResponse> {
  const [url] = args;
  const response = await fetch(url);
  const data = await response.json();
  
  if (!response.ok) {
    throw new ApiError(
      `Failed to fetch data: ${response.statusText}`,
      ErrorType.API_REQUEST_ERROR,
      ErrorSeverity.ERROR,
      {
        status: response.status,
        url
      }
    );
  }
  
  return {
    data,
    status: response.status
  };
}

// Create a resilient version of the API call with retry and circuit breaker
function createResilientApiCall() {
  // Configure circuit breaker
  const breakerOptions: CircuitBreakerOptions = {
    maxFailures: 5,
    resetTimeout: 30000
  };

  // Create retryable version with proper typing
  return makeRetryable(
    fetchData,
    {
      // Custom retry configuration
      maxRetries: 3,
      initialDelayMs: 1000,
      backoffFactor: 2,
      maxDelayMs: 10000,
      jitter: 'full',
      retryableErrors: [
        ErrorType.API_TIMEOUT_ERROR,
        ErrorType.API_RATE_LIMIT_ERROR,
        500, 502, 503, 504
      ]
    },
    createCircuitBreaker
  );
}

// Example usage
async function example() {
  try {
    const resilientApiCall = createResilientApiCall();
    const response = await resilientApiCall('https://api.example.com/data');
    console.log('Data fetched successfully:', response.data);
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(
        `API Error: ${error.message}`,
        `Type: ${error.type}`,
        `Severity: ${error.severity}`,
        `Details:`, error.details
      );
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

// Run example
example().catch(console.error);
