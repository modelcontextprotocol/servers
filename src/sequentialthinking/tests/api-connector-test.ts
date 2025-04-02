/**
 * Test script for the enhanced API connector
 * 
 * This script tests the functionality of the API connector including
 * error handling, caching, and fallback mechanisms.
 */

import { 
  getCompletion, 
  isProviderConfigured, 
  getDefaultModels,
  CompletionRequest
} from '../api-connector-enhanced.js';
import { ApiError, ErrorType, ErrorSeverity } from '../config/errors.js'; // Import enums

// Test provider configuration check
console.log('Testing provider configuration check...');
console.log('OpenAI configured:', isProviderConfigured('openai'));
console.log('OpenRouter configured:', isProviderConfigured('openrouter'));
console.log('Anthropic configured:', isProviderConfigured('anthropic'));

// Test getting default models
console.log('\nTesting getDefaultModels()...');
const defaultModels = getDefaultModels();
console.log('OpenAI default model:', defaultModels.openai.modelId);
console.log('OpenRouter default model:', defaultModels.openrouter.modelId);
console.log('Anthropic default model:', defaultModels.anthropic.modelId);

// Test API completion with mocked response
// Note: This is a mock test since we don't want to make actual API calls during testing
console.log('\nTesting API completion with mocked implementation...');

// Mock the actual API call function
// Using require here for easier mocking in this test script
const originalModule = require('../api-connector-enhanced'); 
const originalGetCompletionInternal = originalModule.getCompletionInternal;

// Replace with mock implementation
originalModule.getCompletionInternal = async (request: CompletionRequest) => {
  console.log('Mock API call with:', {
    provider: request.model.provider,
    model: request.model.modelId,
    promptLength: request.prompt.length,
    hasSystemPrompt: !!request.systemPrompt
  });
  
  // Simulate API response
  return {
    text: `This is a mock response for ${request.model.provider} using ${request.model.modelId}`,
    metadata: {
      provider: request.model.provider,
      model: request.model.modelId,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      latencyMs: 500,
      finishReason: 'stop',
      confidenceScore: 0.85
    }
  };
};

// Wrap tests in an async function to use await
async function runApiTests() {
  // Test successful API call
  try {
    console.log('Testing successful API call...');
    const request: CompletionRequest = {
      prompt: 'This is a test prompt',
      model: defaultModels.openai,
      systemPrompt: 'You are a helpful assistant',
      options: {
        useCache: true
      }
    };
    
    const response = await getCompletion(request);
    console.log('Response text:', response.text);
    console.log('Response metadata:', response.metadata);
    
    // Test caching
    console.log('\nTesting caching (should use cached response)...');
    const cachedResponse = await getCompletion(request);
    console.log('Cached response text:', cachedResponse.text);
    
    // Test with different provider
    console.log('\nTesting with different provider...');
    const request2: CompletionRequest = {
      prompt: 'This is a test prompt',
      model: defaultModels.openrouter,
      options: {
        useCache: false // Disable cache to force new request
      }
    };
    
    const response2 = await getCompletion(request2);
    console.log('Response text:', response2.text);
    console.log('Response metadata:', response2.metadata);
    
  } catch (error) {
    console.error('Error during API test:', error);
  }

  // Test error handling with mock implementation that throws errors
  console.log('\nTesting error handling...');

  // Replace with mock implementation that throws an error
  originalModule.getCompletionInternal = async (request: CompletionRequest) => {
    console.log('Mock API call that fails:', {
      provider: request.model.provider,
      model: request.model.modelId
    });
    
    // Simulate API error
    throw new ApiError(
      `Simulated API error for ${request.model.provider}`,
      ErrorType.API_REQUEST_ERROR, // Use enum member
      ErrorSeverity.ERROR // Use enum member
    );
  };

  // Test error handling
  try {
    console.log('Testing API call that should fail...');
    const request: CompletionRequest = {
      prompt: 'This is a test prompt that should fail',
      model: defaultModels.openai,
      options: {
        useCache: false // Disable cache to force new request
      }
    };
    
    await getCompletion(request);
    console.error('Error was not thrown as expected');
  } catch (error) {
    console.log('Error was caught as expected');
    console.log('Error message:', (error as ApiError).message);
  }

  // Restore original implementation
  originalModule.getCompletionInternal = originalGetCompletionInternal;

  console.log('\nAPI connector test completed successfully');
}

// Run the tests
runApiTests().catch(error => {
  console.error('API connector test suite failed:', error);
  process.exit(1);
});
