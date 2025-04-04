 import axios from 'axios';
 import * as dotenv from 'dotenv';
 import { get as getConfigValue } from './config/index.js'; // Import config getter
 
 // Load environment variables
dotenv.config();

// Constants for API endpoints
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

// Environment variables for API keys
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Interface for model specification
 */
export interface ModelSpec {
  provider: 'openrouter' | 'openai';
  modelId: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Interface for completion request payload
 */
export interface CompletionRequest {
  prompt: string;
  model: ModelSpec;
  maxTokens?: number;
  temperature?: number;
  systemMessage?: string;
}

/**
 * Interface for completion response
 */
export interface CompletionResponse {
  text: string;
  modelUsed: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  // Add metadata for better tracking and analysis
  metadata?: {
    latency?: number;        // Response time in milliseconds
    timestamp?: number;      // When the completion was generated
    requestId?: string;      // For tracking specific requests
    confidenceScore?: number; // Model's confidence in the response (0-1)
  };
}

/**
 * Creates appropriate headers for API requests.
 * @param provider The provider to create headers for
 * @returns HTTP headers object compatible with axios
 */
function createHeaders(provider: 'openrouter' | 'openai'): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  
  if (provider === 'openrouter') {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OpenRouter API key not found in environment variables');
    }
    headers['Authorization'] = `Bearer ${OPENROUTER_API_KEY}`;
    headers['HTTP-Referer'] = 'https://sequential-thinking.mcp-server'; // Replace with your actual referer
    headers['X-Title'] = 'Sequential Thinking MCP Server';
  } else if (provider === 'openai') {
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key not found in environment variables');
    }
    headers['Authorization'] = `Bearer ${OPENAI_API_KEY}`;
  }
  
  return headers;
}

/**
 * Formats a request for the OpenRouter API
 * @param request The completion request
 * @returns Formatted request body for OpenRouter
 */
function formatOpenRouterRequest(request: CompletionRequest) {
  return {
    model: request.model.modelId,
    messages: [
      ...(request.systemMessage ? [{
        role: 'system',
        content: request.systemMessage
      }] : []),
      {
        role: 'user',
        content: request.prompt
      }
    ],
    max_tokens: request.maxTokens || request.model.maxTokens || 1024,
    temperature: request.temperature || request.model.temperature || 0.7
  };
}

/**
 * Formats a request for the OpenAI API
 * @param request The completion request
 * @returns Formatted request body for OpenAI
 */
function formatOpenAIRequest(request: CompletionRequest) {
  return {
    model: request.model.modelId,
    messages: [
      ...(request.systemMessage ? [{
        role: 'system',
        content: request.systemMessage
      }] : []),
      {
        role: 'user',
        content: request.prompt
      }
    ],
    max_tokens: request.maxTokens || request.model.maxTokens || 1024,
    temperature: request.temperature || request.model.temperature || 0.7
  };
}

/**
 * Gets a completion from the specified model via the appropriate API
 * @param request The completion request with prompt and model details
 * @returns A promise resolving to the completion response
 */
export async function getCompletion(request: CompletionRequest): Promise<CompletionResponse> {
  const { provider } = request.model;
  const startTime = Date.now();
  const requestId = generateRequestId();
  
  try {
    let response;
    const headers = createHeaders(provider);
    
    if (provider === 'openrouter') {
      const requestBody = formatOpenRouterRequest(request);
      console.log(`[API-REQUEST-${requestId}] Sending request to OpenRouter with model: ${request.model.modelId}`);
      
      response = await axios.post(
        `${OPENROUTER_BASE_URL}/chat/completions`,
        requestBody,
        { headers }
      );
      
      const latency = Date.now() - startTime;
      console.log(`[API-RESPONSE-${requestId}] Received response from OpenRouter in ${latency}ms`);
      
      return {
        text: response.data.choices[0].message.content,
        modelUsed: response.data.model,
        usage: {
          promptTokens: response.data.usage.prompt_tokens,
          completionTokens: response.data.usage.completion_tokens,
          totalTokens: response.data.usage.total_tokens
        },
        metadata: {
          latency,
          timestamp: Date.now(),
          requestId,
          confidenceScore: calculateConfidenceScore(response.data)
        }
      };
    } else if (provider === 'openai') {
      const requestBody = formatOpenAIRequest(request);
      console.log(`[API-REQUEST-${requestId}] Sending request to OpenAI with model: ${request.model.modelId}`);
      
      response = await axios.post(
        `${OPENAI_BASE_URL}/chat/completions`,
        requestBody,
        { headers }
      );
      
      const latency = Date.now() - startTime;
      console.log(`[API-RESPONSE-${requestId}] Received response from OpenAI in ${latency}ms`);
      
      return {
        text: response.data.choices[0].message.content,
        modelUsed: response.data.model,
        usage: {
          promptTokens: response.data.usage.prompt_tokens,
          completionTokens: response.data.usage.completion_tokens,
          totalTokens: response.data.usage.total_tokens
        },
        metadata: {
          latency,
          timestamp: Date.now(),
          requestId,
          confidenceScore: calculateConfidenceScore(response.data)
        }
      };
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }
  } catch (error) {
    const latency = Date.now() - startTime;
    // Enhanced error handling with tracing
    if (axios.isAxiosError(error) && error.response) {
      console.error(`[API-ERROR-${requestId}] ${provider} Error (${latency}ms): Status ${error.response.status}`);
      console.error(`[API-ERROR-${requestId}] Response data:`, error.response.data);
      
      // Check for rate limiting errors and provide more helpful messages
      const status = error.response.status;
      if (status === 429) {
        throw new Error(`Rate limit exceeded for ${provider}. Please try again later or reduce request frequency.`);
      } else if (status === 401 || status === 403) {
        throw new Error(`Authentication error with ${provider}. Please check your API key.`);
      } else {
        throw new Error(`API error (${provider}): ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
    } else {
      console.error(`[API-ERROR-${requestId}] Error getting completion from ${provider} (${latency}ms):`, error);
      throw new Error(`Error getting completion: ${error instanceof Error ? error.message : String(error)}`);
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
    const finishReason = responseData.choices[0].finish_reason;
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
export function isProviderConfigured(provider: 'openrouter' | 'openai'): boolean {
  if (provider === 'openrouter') {
    return Boolean(OPENROUTER_API_KEY);
  } else if (provider === 'openai') {
    return Boolean(OPENAI_API_KEY);
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
      modelId: 'anthropic/claude-3-opus:beta',
      maxTokens: 4096,
      temperature: 0.7
    },
    openai: {
      provider: 'openai' as const,
      modelId: 'gpt-4-turbo',
      maxTokens: 4096,
      temperature: 0.7
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
  console.warn(`Original provider (${request.model.provider}) failed: ${error.message}`);
  console.warn('Attempting fallback to alternative provider...');
  
  // Switch provider
  const fallbackProvider = request.model.provider === 'openrouter' ? 'openai' : 'openrouter';
  
  // Check if fallback is configured
  if (!isProviderConfigured(fallbackProvider)) {
    throw new Error(`Fallback provider ${fallbackProvider} is not configured. No API key found.`);
  }
  
  // Get appropriate default model for fallback
  const defaultModels = getDefaultModels();
  const fallbackModel = fallbackProvider === 'openrouter' ? defaultModels.openrouter : defaultModels.openai;
  
  // Create fallback request
  const fallbackRequest: CompletionRequest = {
    ...request,
    model: fallbackModel
  };
  
  console.log(`Falling back to ${fallbackProvider} with model ${fallbackModel.modelId}`);
   return getCompletion(fallbackRequest);
 }
 
 /**
  * Calls the configured Gemini model via OpenRouter.
  * @param prompt The user prompt.
  * @param systemMessage Optional system message.
  * @returns A promise resolving to the completion response.
  */
 export async function callOpenRouterGemini(prompt: string, systemMessage?: string): Promise<CompletionResponse> {
   const modelId = getConfigValue<string>('api.openrouter.geminiModel', 'google/gemini-2.5-pro-exp-03-25:free');
   const maxTokens = getConfigValue<number>('api.openrouter.maxTokens', 5000); // Use configured max tokens
   const temperature = getConfigValue<number>('api.openrouter.temperature', 0.7);
 
   const request: CompletionRequest = {
     prompt,
     model: {
       provider: 'openrouter',
       modelId: modelId,
     },
     maxTokens,
     temperature,
     systemMessage
   };
   return getCompletion(request);
 }
 
 /**
  * Calls the configured Claude model via OpenRouter.
  * @param prompt The user prompt.
  * @param systemMessage Optional system message.
  * @returns A promise resolving to the completion response.
  */
 export async function callOpenRouterClaude(prompt: string, systemMessage?: string): Promise<CompletionResponse> {
   const modelId = getConfigValue<string>('api.openrouter.claudeModel', 'anthropic/claude-3.7-sonnet');
   const maxTokens = getConfigValue<number>('api.openrouter.maxTokens', 3000); // Use configured max tokens
   const temperature = getConfigValue<number>('api.openrouter.temperature', 0.7);
 
   const request: CompletionRequest = {
     prompt,
     model: {
       provider: 'openrouter',
       modelId: modelId,
     },
     maxTokens,
     temperature,
     systemMessage
   };
   return getCompletion(request);
 }
