/**
 * Test Script for Adaptive Fallback Mechanism
 * 
 * This script demonstrates the effectiveness of the adaptive fallback mechanism
 * compared to the current aggressive truncation approach.
 */

// Import the adaptive fallback implementation
const { 
  adaptiveFallbackCompression,
  countTokens
} = require('./adaptive-fallback-implementation');

/**
 * Simple implementation of the current aggressive truncation approach
 * @param {string} text - The original thought text
 * @param {number} maxChars - Maximum characters to keep (default: 20)
 * @return {string} - The truncated text
 */
function aggressiveTruncation(text, maxChars = 20) {
  if (text.length <= maxChars) {
    return text;
  }
  return text.substring(0, maxChars) + '...';
}

/**
 * Compare the two approaches and display the results
 * @param {string} text - The text to compress
 * @param {number} targetTokens - Target token count for adaptive fallback
 */
function compareApproaches(text, targetTokens = 50) {
  console.log('='.repeat(80));
  console.log('ORIGINAL TEXT:');
  console.log('-'.repeat(80));
  console.log(text);
  console.log('-'.repeat(80));
  console.log(`Original length: ${text.length} characters, ~${countTokens(text)} tokens`);
  console.log('='.repeat(80));
  
  // Current aggressive approach
  const aggressiveResult = aggressiveTruncation(text);
  console.log('CURRENT AGGRESSIVE APPROACH:');
  console.log('-'.repeat(80));
  console.log(aggressiveResult);
  console.log('-'.repeat(80));
  console.log(`Truncated length: ${aggressiveResult.length} characters, ~${countTokens(aggressiveResult)} tokens`);
  console.log(`Compression ratio: ${Math.round(aggressiveResult.length / text.length * 100)}%`);
  console.log(`Information preserved: Very low (only first ${aggressiveResult.length - 3} characters)`);
  console.log('='.repeat(80));
  
  // Adaptive fallback approach
  const adaptiveResult = adaptiveFallbackCompression(text, targetTokens);
  console.log('ADAPTIVE FALLBACK APPROACH:');
  console.log('-'.repeat(80));
  console.log(adaptiveResult);
  console.log('-'.repeat(80));
  console.log(`Compressed length: ${adaptiveResult.length} characters, ~${countTokens(adaptiveResult)} tokens`);
  console.log(`Compression ratio: ${Math.round(adaptiveResult.length / text.length * 100)}%`);
  
  // Estimate information preservation
  const infoPreservation = estimateInformationPreservation(text, adaptiveResult);
  console.log(`Information preserved: ${infoPreservation.level} (${infoPreservation.percentage}%)`);
  console.log(`Key concepts retained: ${infoPreservation.conceptsRetained} of ${infoPreservation.totalConcepts}`);
  console.log('='.repeat(80));
  
  // Summary comparison
  console.log('COMPARISON SUMMARY:');
  console.log('-'.repeat(80));
  console.log(`Size reduction: Aggressive: ${Math.round((1 - aggressiveResult.length / text.length) * 100)}%, Adaptive: ${Math.round((1 - adaptiveResult.length / text.length) * 100)}%`);
  console.log(`Information preservation: Aggressive: Very low, Adaptive: ${infoPreservation.level}`);
  console.log(`Token usage: Aggressive: ~${countTokens(aggressiveResult)}, Adaptive: ~${countTokens(adaptiveResult)}, Target: ${targetTokens}`);
  console.log('='.repeat(80));
}

/**
 * Estimate how much information is preserved in the compressed text
 * @param {string} originalText - The original text
 * @param {string} compressedText - The compressed text
 * @return {object} - Information about preservation level
 */
function estimateInformationPreservation(originalText, compressedText) {
  // Extract key concepts from both texts
  const originalConcepts = extractKeyTerms(originalText);
  const compressedConcepts = extractKeyTerms(compressedText);
  
  // Count how many original concepts are retained
  const retainedConcepts = originalConcepts.filter(concept => 
    compressedConcepts.some(c => c.toLowerCase().includes(concept.toLowerCase()))
  );
  
  const percentage = Math.round(retainedConcepts.length / originalConcepts.length * 100);
  
  // Determine preservation level
  let level;
  if (percentage >= 80) {
    level = 'Very high';
  } else if (percentage >= 60) {
    level = 'High';
  } else if (percentage >= 40) {
    level = 'Medium';
  } else if (percentage >= 20) {
    level = 'Low';
  } else {
    level = 'Very low';
  }
  
  return {
    level,
    percentage,
    conceptsRetained: retainedConcepts.length,
    totalConcepts: originalConcepts.length
  };
}

/**
 * Extract key terms from text
 * @param {string} text - The text to analyze
 * @return {string[]} - Array of key terms
 */
function extractKeyTerms(text) {
  const terms = [];
  
  // Extract capitalized terms
  const capitalizedRegex = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
  let match;
  while ((match = capitalizedRegex.exec(text)) !== null) {
    if (match[0] && match[0].length > 3) {
      terms.push(match[0]);
    }
  }
  
  // Extract technical terms
  const technicalRegex = /\b(?:algorithm|system|process|method|framework|architecture|component|module|function|class|interface|protocol|api|database|model|pattern|design|implementation|optimization|analysis)\b/gi;
  while ((match = technicalRegex.exec(text)) !== null) {
    terms.push(match[0]);
  }
  
  // Extract terms with important adjectives
  const importantRegex = /\b(?:important|critical|essential|key|significant|main|primary|central)\s+([a-z]+(?:\s+[a-z]+){0,3})\b/gi;
  while ((match = importantRegex.exec(text)) !== null) {
    if (match[1]) {
      terms.push(match[1]);
    }
  }
  
  // Deduplicate and return
  return [...new Set(terms)];
}

// Test cases
console.log('ADAPTIVE FALLBACK MECHANISM TEST');
console.log('='.repeat(80));

// Test Case 1: Short text
const shortText = "This is a short thought that doesn't need compression.";
console.log('TEST CASE 1: SHORT TEXT');
compareApproaches(shortText, 20);

// Test Case 2: Medium text
const mediumText = "The Sequential Thinking codebase implements a sophisticated token optimization strategy. It leverages two AI models in tandem: Gemini for preprocessing and Claude for final analysis. This approach optimizes token usage while maintaining high-quality thinking analysis. However, the current fallback mechanism when OpenRouter is unavailable is too aggressive, truncating thoughts to just 20 characters.";
console.log('TEST CASE 2: MEDIUM TEXT');
compareApproaches(mediumText, 50);

// Test Case 3: Long text
const longText = "The Sequential Thinking codebase implements a sophisticated token optimization strategy that leverages two AI models in tandem: Gemini for preprocessing and Claude for final analysis. This approach optimizes token usage while maintaining high-quality thinking analysis. However, several issues have been identified. The current fallback mechanism when OpenRouter is unavailable is too aggressive, truncating thoughts to just 20 characters. There's insufficient warning and monitoring when token optimization isn't working properly. While there's a verification step to ensure thoughts are processed by Gemini, it could be more robust. The ThoughtContext class keeps only the 3 most recent thoughts, which might be insufficient for complex reasoning chains. The template system is well-designed but could benefit from more dynamic template generation and customization options. The visualization capabilities are limited to Mermaid diagrams and JSON output. The AI advisor component lacks integration with external knowledge sources. There's no caching mechanism for similar thoughts, leading to redundant API calls. These issues stem from root causes including the inherent tension between token optimization and quality preservation, architectural constraints, single-path success assumption, development prioritization, static design philosophy, isolation from external knowledge, limited feedback loop, and extreme resource conservation.";
console.log('TEST CASE 3: LONG TEXT');
compareApproaches(longText, 75);

console.log('TEST COMPLETE');
