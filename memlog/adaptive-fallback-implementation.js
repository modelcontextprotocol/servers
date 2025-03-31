/**
 * Adaptive Fallback Mechanism for Sequential Thinking
 * 
 * This implementation replaces the aggressive 20-character truncation with
 * a more sophisticated fallback system that progressively reduces detail
 * while preserving core meaning.
 */

/**
 * Enhanced fallback compression for when Gemini processing fails
 * Implements a tiered approach to compression based on thought complexity
 * @param {string} text - The original thought text to compress
 * @param {number} targetTokens - Target token count (optional, defaults to 100)
 * @return {string} - The compressed thought text
 */
function adaptiveFallbackCompression(text, targetTokens = 100) {
  // If text is already short, return it directly
  if (countTokens(text) <= targetTokens) {
    console.log(`Text already within token limit (${countTokens(text)} tokens)`);
    return text;
  }

  // Tier 1: Extract key sentences (least aggressive)
  const tier1Result = extractKeySentences(text, targetTokens);
  if (countTokens(tier1Result) <= targetTokens) {
    console.log(`Tier 1 compression successful: ${countTokens(tier1Result)} tokens`);
    return tier1Result;
  }

  // Tier 2: Extract key phrases with summarization
  const tier2Result = extractKeyPhrases(text, targetTokens);
  if (countTokens(tier2Result) <= targetTokens) {
    console.log(`Tier 2 compression successful: ${countTokens(tier2Result)} tokens`);
    return tier2Result;
  }

  // Tier 3: Concept extraction (more aggressive)
  const tier3Result = extractConcepts(text, targetTokens);
  if (countTokens(tier3Result) <= targetTokens) {
    console.log(`Tier 3 compression successful: ${countTokens(tier3Result)} tokens`);
    return tier3Result;
  }

  // Tier 4: Last resort - truncate but preserve structure
  console.log(`Falling back to structured truncation: target ${targetTokens} tokens`);
  return structuredTruncation(text, targetTokens);
}

/**
 * Count tokens in a string (approximate)
 * @param {string} text - The text to count tokens for
 * @return {number} - Approximate token count
 */
function countTokens(text) {
  // Simple approximation: 4 characters per token on average
  return Math.ceil(text.length / 4);
}

/**
 * Extract key sentences from text based on importance scoring
 * @param {string} text - The original text
 * @param {number} targetTokens - Target token count
 * @return {string} - Text with only key sentences
 */
function extractKeySentences(text, targetTokens) {
  // Extract sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  if (sentences.length <= 2) {
    return text;
  }

  // Score sentences by importance
  const scoredSentences = sentences.map((sentence, index) => {
    // Position score - first and last sentences are important
    const positionScore = (index === 0 || index === sentences.length - 1) ? 2 : 1;
    
    // Keyword score - sentences with important keywords score higher
    const keywordScore = countKeywords(sentence);
    
    // Length score - prefer medium length sentences
    const lengthScore = getSentenceLengthScore(sentence);
    
    return {
      sentence,
      score: positionScore + keywordScore + lengthScore,
      index
    };
  });
  
  // Sort by score and take top sentences until we hit target token count
  const sortedSentences = [...scoredSentences].sort((a, b) => b.score - a.score);
  
  let result = '';
  let currentTokens = 0;
  
  // Always include first and last sentence for context
  const firstSentence = sentences[0];
  const lastSentence = sentences[sentences.length - 1];
  
  result += firstSentence + ' ';
  currentTokens += countTokens(firstSentence);
  
  // Add highest scored sentences that aren't the first or last
  for (const {sentence, index} of sortedSentences) {
    if (index !== 0 && index !== sentences.length - 1) {
      const sentenceTokens = countTokens(sentence);
      if (currentTokens + sentenceTokens <= targetTokens - countTokens(lastSentence)) {
        result += sentence + ' ';
        currentTokens += sentenceTokens;
      }
    }
  }
  
  // Add last sentence if not already included and if there's room
  if (sentences.length > 1) {
    result += lastSentence;
    currentTokens += countTokens(lastSentence);
  }
  
  return result.trim();
}

/**
 * Extract key phrases from text when sentence extraction isn't enough
 * @param {string} text - The original text
 * @param {number} targetTokens - Target token count
 * @return {string} - Text with key phrases and a summary
 */
function extractKeyPhrases(text, targetTokens) {
  // Extract the first sentence as context
  const firstSentenceMatch = text.match(/^[^.!?]+[.!?]/);
  const firstSentence = firstSentenceMatch ? firstSentenceMatch[0] : '';
  
  // Extract key phrases (noun phrases, definitions, etc.)
  const keyPhrases = extractNounPhrases(text);
  
  // Create a bullet point summary
  let result = firstSentence + '\n\nKey points:\n';
  
  // Add as many key phrases as will fit
  let currentTokens = countTokens(result);
  
  for (const phrase of keyPhrases) {
    const phraseWithBullet = `• ${phrase}\n`;
    const phraseTokens = countTokens(phraseWithBullet);
    
    if (currentTokens + phraseTokens <= targetTokens) {
      result += phraseWithBullet;
      currentTokens += phraseTokens;
    } else {
      break;
    }
  }
  
  return result.trim();
}

/**
 * Extract core concepts when more aggressive compression is needed
 * @param {string} text - The original text
 * @param {number} targetTokens - Target token count
 * @return {string} - Conceptual summary of the text
 */
function extractConcepts(text, targetTokens) {
  // Extract the first sentence
  const firstSentenceMatch = text.match(/^[^.!?]+[.!?]/);
  const firstSentence = firstSentenceMatch ? firstSentenceMatch[0] : '';
  
  // Count words in the text
  const wordCount = text.split(/\s+/).length;
  
  // Extract key concepts (entities, themes, etc.)
  const concepts = extractEntities(text);
  
  // Create a conceptual summary
  let result = `${firstSentence}\n\nCore concepts (from ${wordCount} words):\n`;
  
  // Add as many concepts as will fit
  let currentTokens = countTokens(result);
  
  for (const concept of concepts) {
    const conceptText = `• ${concept}\n`;
    const conceptTokens = countTokens(conceptText);
    
    if (currentTokens + conceptTokens <= targetTokens) {
      result += conceptText;
      currentTokens += conceptTokens;
    } else {
      break;
    }
  }
  
  return result.trim();
}

/**
 * Last resort: structured truncation that preserves beginning and end
 * @param {string} text - The original text
 * @param {number} targetTokens - Target token count
 * @return {string} - Truncated text with structure preserved
 */
function structuredTruncation(text, targetTokens) {
  const totalTokens = countTokens(text);
  
  // If target is very small, just take the first sentence
  if (targetTokens < 20) {
    const firstSentenceMatch = text.match(/^[^.!?]+[.!?]/);
    return firstSentenceMatch 
      ? firstSentenceMatch[0] 
      : text.substring(0, targetTokens * 4);
  }
  
  // Allocate tokens: 40% to start, 40% to end, 20% to middle summary
  const startTokens = Math.floor(targetTokens * 0.4);
  const endTokens = Math.floor(targetTokens * 0.4);
  const middleTokens = targetTokens - startTokens - endTokens;
  
  // Extract portions
  const startText = text.substring(0, startTokens * 4);
  const endText = text.substring(text.length - (endTokens * 4));
  
  // Create a middle summary
  const middleSummary = `[...${totalTokens - startTokens - endTokens} tokens omitted...]`;
  
  return `${startText}${middleSummary}${endText}`;
}

/**
 * Count important keywords in a sentence
 * @param {string} sentence - The sentence to analyze
 * @return {number} - Keyword score
 */
function countKeywords(sentence) {
  // List of important keywords relevant to thinking processes
  const keywords = [
    'therefore', 'because', 'however', 'consequently', 'furthermore',
    'analysis', 'conclusion', 'evidence', 'hypothesis', 'verification',
    'important', 'significant', 'critical', 'key', 'essential',
    'problem', 'solution', 'cause', 'effect', 'result'
  ];
  
  const lowerSentence = sentence.toLowerCase();
  return keywords.reduce((count, keyword) => {
    return count + (lowerSentence.includes(keyword) ? 1 : 0);
  }, 0);
}

/**
 * Score sentence based on its length
 * @param {string} sentence - The sentence to score
 * @return {number} - Length score
 */
function getSentenceLengthScore(sentence) {
  const words = sentence.split(/\s+/).length;
  
  // Prefer sentences between 10-25 words
  if (words >= 10 && words <= 25) {
    return 2;
  } else if (words < 5 || words > 40) {
    return 0;
  } else {
    return 1;
  }
}

/**
 * Extract noun phrases from text (simplified implementation)
 * @param {string} text - The text to analyze
 * @return {string[]} - Array of noun phrases
 */
function extractNounPhrases(text) {
  // This is a simplified implementation
  // In a real implementation, you would use NLP libraries
  
  // Look for capitalized phrases, phrases after "is", "are", etc.
  const phrases = [];
  
  // Extract phrases after "is", "are", "means", etc.
  const definitionRegex = /(?:is|are|means|refers to|defined as)[:\s]+([^.!?;]+)/g;
  let match;
  while ((match = definitionRegex.exec(text)) !== null) {
    if (match[1] && match[1].trim().length > 5) {
      phrases.push(match[1].trim());
    }
  }
  
  // Extract capitalized phrases that might be important concepts
  const capitalizedRegex = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
  while ((match = capitalizedRegex.exec(text)) !== null) {
    if (match[0] && match[0].length > 3) {
      phrases.push(match[0]);
    }
  }
  
  // Extract phrases with important adjectives
  const importantRegex = /\b(?:important|critical|essential|key|significant|main|primary|central)\s+([a-z]+(?:\s+[a-z]+){0,3})\b/gi;
  while ((match = importantRegex.exec(text)) !== null) {
    if (match[1] && match[1].trim().length > 3) {
      phrases.push(match[1].trim());
    }
  }
  
  // Deduplicate and return
  return [...new Set(phrases)];
}

/**
 * Extract entities and themes from text (simplified implementation)
 * @param {string} text - The text to analyze
 * @return {string[]} - Array of entities and themes
 */
function extractEntities(text) {
  // This is a simplified implementation
  // In a real implementation, you would use NLP libraries
  
  const entities = [];
  
  // Extract capitalized entities
  const entityRegex = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
  let match;
  while ((match = entityRegex.exec(text)) !== null) {
    if (match[0] && match[0].length > 3) {
      entities.push(match[0]);
    }
  }
  
  // Extract technical terms (simplified)
  const technicalRegex = /\b(?:algorithm|system|process|method|framework|architecture|component|module|function|class|interface|protocol|api|database|model|pattern|design|implementation|optimization|analysis)\b/gi;
  while ((match = technicalRegex.exec(text)) !== null) {
    const context = text.substring(Math.max(0, match.index - 20), Math.min(text.length, match.index + match[0].length + 20));
    entities.push(context.trim());
  }
  
  // Deduplicate and return
  return [...new Set(entities)];
}

// Example usage
function testAdaptiveFallback() {
  const shortText = "This is a short thought that doesn't need compression.";
  console.log("Short text result:", adaptiveFallbackCompression(shortText));
  
  const mediumText = "The Sequential Thinking codebase implements a sophisticated token optimization strategy. It leverages two AI models in tandem: Gemini for preprocessing and Claude for final analysis. This approach optimizes token usage while maintaining high-quality thinking analysis. However, the current fallback mechanism when OpenRouter is unavailable is too aggressive, truncating thoughts to just 20 characters.";
  console.log("Medium text result:", adaptiveFallbackCompression(mediumText, 50));
  
  const longText = "The Sequential Thinking codebase implements a sophisticated token optimization strategy that leverages two AI models in tandem: Gemini for preprocessing and Claude for final analysis. This approach optimizes token usage while maintaining high-quality thinking analysis. However, several issues have been identified. The current fallback mechanism when OpenRouter is unavailable is too aggressive, truncating thoughts to just 20 characters. There's insufficient warning and monitoring when token optimization isn't working properly. While there's a verification step to ensure thoughts are processed by Gemini, it could be more robust. The ThoughtContext class keeps only the 3 most recent thoughts, which might be insufficient for complex reasoning chains. The template system is well-designed but could benefit from more dynamic template generation and customization options. The visualization capabilities are limited to Mermaid diagrams and JSON output. The AI advisor component lacks integration with external knowledge sources. There's no caching mechanism for similar thoughts, leading to redundant API calls. These issues stem from root causes including the inherent tension between token optimization and quality preservation, architectural constraints, single-path success assumption, development prioritization, static design philosophy, isolation from external knowledge, limited feedback loop, and extreme resource conservation.";
  console.log("Long text result:", adaptiveFallbackCompression(longText, 75));
}

// Export functions for use in the Sequential Thinking codebase
module.exports = {
  adaptiveFallbackCompression,
  countTokens,
  extractKeySentences,
  extractKeyPhrases,
  extractConcepts,
  structuredTruncation
};

// Uncomment to test
// testAdaptiveFallback();
