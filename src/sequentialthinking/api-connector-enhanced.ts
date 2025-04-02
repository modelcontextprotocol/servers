/**
 * API Connector module for Sequential Thinking MCP Server
 * 
 * This module provides a unified interface for interacting with various LLM APIs,
 * with improved error handling, fallback mechanisms, and performance optimizations.
 */

import axios from 'axios';
import { get } from './config/config.js';
import { logger } from './config/logger.js';
import { 
  ApiError, 
  ErrorType,
  ErrorSeverity,
  createCircuitBreaker,
  withErrorHandling
} from './config/errors.js';

// Types for API requests and responses
export interface CompletionModel {
  provider: 'openrouter' | 'openai' | 'anthropic';
  modelId: string;
  maxTokens: number;
  temperature: number;
}

export interface CompletionRequest {
  prompt: string;
  model: CompletionModel;
  systemPrompt?: string;
  options?: {
    timeout?: number;
    retryAttempts?: number;
    useCache?: boolean;
  };
}

export interface CompletionResponse {
  text: string;
  metadata: {
    provider: string;
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    latencyMs: number;
    finishReason?: string;
    confidenceScore: number;
  };
}

// Cache for API responses
interface CacheEntry {
  response: CompletionResponse;
  timestamp: number;
  expiresAt: number;
}

// In-memory cache
const responseCache = new Map<string, CacheEntry>();

// Cache TTL in milliseconds (default: 1 hour)
const CACHE_TTL = 60 * 60 * 1000;

// Maximum cache size
const MAX_CACHE_SIZE = 1000;

// API keys from configuration
const OPENAI_API_KEY = get<string>('api.openai.apiKey', process.env.OPENAI_API_KEY || '');
const OPENROUTER_API_KEY = get<string>('api.openrouter.apiKey', process.env.OPENROUTER_API_KEY || '');
const ANTHROPIC_API_KEY = get<string>('api.anthropic.apiKey', process.env.ANTHROPIC_API_KEY || '');

/**
 * Generate a cache key for a completion request
 * @param request The completion request
 * @returns A cache key string
 */
function generateCacheKey(request: CompletionRequest): string {
  // Create a deterministic string representation of the request
  const { prompt, model, systemPrompt } = request;
  return `${model.provider}:${model.modelId}:${model.temperature}:${model.maxTokens}:${systemPrompt || ''}:${prompt}`;
}

/**
 * Check if a cached response is valid
 * @param entry The cache entry to check
 * @returns Whether the cache entry is valid
 */
function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() < entry.expiresAt;
}

/**
 * Prune the cache if it exceeds the maximum size
 */
function pruneCache(): void {
  if (responseCache.size <= MAX_CACHE_SIZE) {
    return;
  }
  
  logger.debug(`Pruning API response cache (size: ${responseCache.size})`);
  
  // Convert to array for sorting
  const entries = Array.from(responseCache.entries());
  
  // Sort by timestamp (oldest first)
  entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
  
  // Remove oldest entries until we're under the limit
  const entriesToRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
  
  for (const [key] of entriesToRemove) {
    responseCache.delete(key);
  }
  
  logger.debug(`Cache pruned to ${responseCache.size} entries`);
}

/**
 * Get a completion from the API with caching
 * @param request The completion request
 * @returns A promise resolving to the completion response
 */
export async function getCompletion(request: CompletionRequest): Promise<CompletionResponse> {
  const requestId = generateRequestId();
  logger.debug(`API request ${requestId} started`, { provider: request.model.provider, model: request.model.modelId });
  
  // Check cache if enabled
  if (request.options?.useCache !== false) {
    const cacheKey = generateCacheKey(request);
    const cachedResponse = responseCache.get(cacheKey);
    
    if (cachedResponse && isCacheValid(cachedResponse)) {
      logger.debug(`Cache hit for request ${requestId}`, { provider: request.model.provider });
      return cachedResponse.response;
    }
  }
  
  // Apply circuit breaker pattern
  const getCompletionWithCircuitBreaker = createCircuitBreaker(
    getCompletionInternal,
    {
      maxFailures: 3,
      resetTimeout: 60000, // 1 minute
      fallback: async (req: CompletionRequest) => {
        return getFallbackCompletion(req, new ApiError(
          'Circuit breaker triggered fallback',
          ErrorType.API_REQUEST_ERROR,
          ErrorSeverity.WARNING
        ));
      }
    }
  );
  
  // Apply error handling wrapper
  const getCompletionWithErrorHandling = withErrorHandling(
    getCompletionWithCircuitBreaker,
    requestId
  );
  
  // Get completion with error handling and circuit breaker
  const response = await getCompletionWithErrorHandling(request);
  
  // Cache the response if caching is enabled
  if (request.options?.useCache !== false) {
    const cacheKey = generateCacheKey(request);
    responseCache.set(cacheKey, {
      response,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_TTL
    });
    
    // Prune cache if necessary
    pruneCache();
  }
  
  return response;
}

/**
 * Internal function to get a completion from the API
 * @param request The completion request
 * @returns A promise resolving to the completion response
 */
async function getCompletionInternal(request: CompletionRequest): Promise<CompletionResponse> {
  const { prompt, model, systemPrompt, options } = request;
  const { provider, modelId, maxTokens, temperature } = model;
  
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  // Set timeout from options or default
  const timeout = options?.timeout || get<number>(`api.${provider}.timeout`, 60000);
  
  try {
    if (provider === 'openai') {
      if (!OPENAI_API_KEY) {
        throw new ApiError(
          'OpenAI API key not configured',
          ErrorType.API_AUTHENTICATION_ERROR,
          ErrorSeverity.ERROR
        );
      }
      
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: modelId,
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt }
          ],
          max_tokens: maxTokens,
          temperature: temperature
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          timeout: timeout
        }
      );
      
      const latency = Date.now() - startTime;
      logger.debug(`OpenAI API response received in ${latency}ms`, { requestId });
      
      return {
        text: response.data.choices[0].message.content,
        metadata: {
          provider: 'openai',
          model: modelId,
          promptTokens: response.data.usage?.prompt_tokens,
          completionTokens: response.data.usage?.completion_tokens,
          totalTokens: response.data.usage?.total_tokens,
          latencyMs: latency,
          finishReason: response.data.choices[0].finish_reason,
          confidenceScore: calculateConfidenceScore(response.data)
        }
      };
    } else if (provider === 'openrouter') {
      if (!OPENROUTER_API_KEY) {
        throw new ApiError(
          'OpenRouter API key not configured',
          ErrorType.API_AUTHENTICATION_ERROR,
          ErrorSeverity.ERROR
        );
      }
      
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: modelId,
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt }
          ],
          max_tokens: maxTokens,
          temperature: temperature
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://modelcontextprotocol.io',
            'X-Title': 'Sequential Thinking MCP Server'
          },
          timeout: timeout
        }
      );
      
      const latency = Date.now() - startTime;
      logger.debug(`OpenRouter API response received in ${latency}ms`, { requestId });
      
      return {
        text: response.data.choices[0].message.content,
        metadata: {
          provider: 'openrouter',
          model: modelId,
          promptTokens: response.data.usage?.prompt_tokens,
          completionTokens: response.data.usage?.completion_tokens,
          totalTokens: response.data.usage?.total_tokens,
          latencyMs: latency,
          finishReason: response.data.choices[0].finish_reason,
          confidenceScore: calculateConfidenceScore(response.data)
        }
      };
    } else if (provider === 'anthropic') {
      if (!ANTHROPIC_API_KEY) {
        throw new ApiError(
          'Anthropic API key not configured',
          ErrorType.API_AUTHENTICATION_ERROR,
          ErrorSeverity.ERROR
        );
      }
      
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: modelId,
          messages: [
            { role: 'user', content: prompt }
          ],
          system: systemPrompt,
          max_tokens: maxTokens,
          temperature: temperature
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          timeout: timeout
        }
      );
      
      const latency = Date.now() - startTime;
      logger.debug(`Anthropic API response received in ${latency}ms`, { requestId });
      
      return {
        text: response.data.content[0].text,
        metadata: {
          provider: 'anthropic',
          model: modelId,
          latencyMs: latency,
          finishReason: response.data.stop_reason,
          confidenceScore: calculateConfidenceScore(response.data)
        }
      };
    } else {
      throw new ApiError(
        `Unsupported provider: ${provider}`,
        ErrorType.API_REQUEST_ERROR,
        ErrorSeverity.ERROR
      );
    }
  } catch (error) {
    const latency = Date.now() - startTime;
    
    // Enhanced error handling with tracing
    if (axios.isAxiosError(error) && error.response) {
      logger.error(`API error for ${provider}`, {
        requestId,
        status: error.response.status,
        data: error.response.data,
        latency
      });
      
      // Check for rate limiting errors
      const status = error.response.status;
      if (status === 429) {
        throw new ApiError(
          `Rate limit exceeded for ${provider}`,
          ErrorType.API_RATE_LIMIT_ERROR,
          ErrorSeverity.WARNING,
          { provider, status, latency },
          error
        );
      } else if (status === 401 || status === 403) {
        throw new ApiError(
          `Authentication error with ${provider}`,
          ErrorType.API_AUTHENTICATION_ERROR,
          ErrorSeverity.ERROR,
          { provider, status, latency },
          error
        );
      } else {
        throw new ApiError(
          `API error (${provider}): ${error.response.status}`,
          ErrorType.API_RESPONSE_ERROR,
          ErrorSeverity.ERROR,
          { provider, status, data: error.response.data, latency },
          error
        );
      }
    } else {
      logger.error(`Error getting completion from ${provider}`, {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        latency
      });
      
      throw new ApiError(
        `Error getting completion: ${error instanceof Error ? error.message : String(error)}`,
        ErrorType.API_REQUEST_ERROR,
        ErrorSeverity.ERROR,
        { provider, latency },
        error
      );
    }
  }
}

/**
 * Generates a unique request ID for tracking
 * @returns A unique request ID string
 */
function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Calculates a confidence score based on model response data
 * @param responseData The raw response data from the API
 * @returns A confidence score between 0 and 1
 */
function calculateConfidenceScore(responseData: any): number {
  // This is a simplified version. In a real system, you would use:
  // 1. Log probabilities if available from the API
  // 2. Model-specific confidence signals
  // 3. Consistency metrics across multiple samples
  
  // For now, we'll use a simple heuristic based on available data:
  if (responseData.choices && responseData.choices.length > 0) {
    // Check for finish_reason - 'stop' is typically good
    const finishReason = responseData.choices[0].finish_reason || responseData.stop_reason;
    const baseScore = finishReason === 'stop' ? 0.8 : 
                     finishReason === 'length' ? 0.5 : 0.6;
    
    // If logprobs are available (some models provide them)
    if (responseData.choices[0].logprobs) {
      // Higher average token probability = higher confidence
      return Math.min(0.95, baseScore + 0.15);
    }
    
    return baseScore;
  }
  
  return 0.5; // Default middle confidence when we can't determine
}

/**
 * Checks if the specified provider is properly configured
 * @param provider The provider to check
 * @returns Boolean indicating if the provider is configured
 */
export function isProviderConfigured(provider: 'openrouter' | 'openai' | 'anthropic'): boolean {
  if (provider === 'openrouter') {
    return Boolean(OPENROUTER_API_KEY);
  } else if (provider === 'openai') {
    return Boolean(OPENAI_API_KEY);
  } else if (provider === 'anthropic') {
    return Boolean(ANTHROPIC_API_KEY);
  }
  return false;
}

/**
 * Gets default model specifications for each provider
 * @returns Object containing default models for each provider
 */
export function getDefaultModels() {
  return {
    openrouter: {
      provider: 'openrouter' as const,
      modelId: get<string>('api.openrouter.defaultModel', 'anthropic/claude-3-opus:beta'),
      maxTokens: get<number>('api.openrouter.maxTokens', 4096),
      temperature: get<number>('api.openrouter.temperature', 0.7)
    },
    openai: {
      provider: 'openai' as const,
      modelId: get<string>('api.openai.defaultModel', 'gpt-4-turbo'),
      maxTokens: get<number>('api.openai.maxTokens', 4096),
      temperature: get<number>('api.openai.temperature', 0.7)
    },
    anthropic: {
      provider: 'anthropic' as const,
      modelId: get<string>('api.anthropic.defaultModel', 'claude-3-opus'),
      maxTokens: get<number>('api.anthropic.maxTokens', 4096),
      temperature: get<number>('api.anthropic.temperature', 0.7)
    }
  };
}

/**
 * Fallback to alternative provider if primary provider fails
 * @param request The original completion request
 * @param error The error that occurred with the primary provider
 * @returns A promise resolving to the completion response from the fallback provider
 */
export async function getFallbackCompletion(
  request: CompletionRequest, 
  error: Error
): Promise<CompletionResponse> {
  logger.warn(`Original provider (${request.model.provider}) failed: ${error.message}`, {
    provider: request.model.provider,
    error: error instanceof Error ? error.message : String(error)
  });
  
  // Determine fallback provider order
  const providerOrder = ['openai', 'openrouter', 'anthropic'];
  const currentIndex = providerOrder.indexOf(request.model.provider as string);
  
  // Try providers in order, starting after the current one
  const fallbackProviders = [
    ...providerOrder.slice(currentIndex + 1),
    ...providerOrder.slice(0, currentIndex)
  ];
  
  // Try each fallback provider
  for (const fallbackProvider of fallbackProviders) {
    if (isProviderConfigured(fallbackProvider as 'openai' | 'openrouter' | 'anthropic')) {
      logger.info(`Attempting fallback to ${fallbackProvider}`);
      
      // Get appropriate default model for fallback
      const defaultModels = getDefaultModels();
      const fallbackModel = defaultModels[fallbackProvider as keyof typeof defaultModels];
      
      // Create fallback request
      const fallbackRequest: CompletionRequest = {
        ...request,
        model: fallbackModel,
        options: {
          ...request.options,
          // Don't use cache for fallback to ensure fresh response
          useCache: false
        }
      };
      
      try {
        // Get completion from fallback provider
        return await getCompletionInternal(fallbackRequest);
      } catch (fallbackError) {
        logger.warn(`Fallback to ${fallbackProvider} failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        // Continue to next fallback provider
      }
    }
  }
  
  // If all fallbacks fail, throw the original error
  throw error;
}
