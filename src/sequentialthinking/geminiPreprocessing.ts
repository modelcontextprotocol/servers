/**
 * Preprocessing functions specifically for optimizing input for Gemini Pro 2.5.
 * The goal is to reduce token count while preserving essential meaning, potentially using Gemini itself for summarization.
 */
import axios from 'axios';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_MODEL = "google/gemini-2.5-pro-exp-03-25:free"; // Your specified model
const SUMMARIZATION_THRESHOLD = 100; // Only summarize if thought is longer than this many characters

/**
 * Summarizes a thought using the Gemini model via OpenRouter.
 *
 * @param thought The original thought string.
 * @returns A promise that resolves to the summarized thought string, or the original thought if summarization fails or is not needed.
 */
async function summarizeThoughtWithGemini(thought: string): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    console.warn("OpenRouter API key not configured. Skipping summarization.");
    return thought;
  }

  if (thought.length <= SUMMARIZATION_THRESHOLD) {
    console.log("Thought is short. Skipping summarization.");
    return thought;
  }

  console.log(`Attempting summarization for thought (length: ${thought.length})...`);

  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: GEMINI_MODEL,
        messages: [
          { role: "system", content: "Summarize the following text concisely, preserving the core meaning. Focus on key actions, decisions, or insights. Be brief." },
          { role: "user", content: thought }
        ],
        max_tokens: Math.max(50, Math.floor(thought.length / 4)), // Limit summary size, ensure minimum
        temperature: 0.5, // Lower temperature for more focused summary
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          // Optional: Add Referer and X-Title headers as recommended by OpenRouter
          // 'HTTP-Referer': 'YOUR_SITE_URL',
          // 'X-Title': 'YOUR_SITE_NAME',
        }
      }
    );

    if (response.data.choices && response.data.choices.length > 0 && response.data.choices[0].message?.content) {
      const summary = response.data.choices[0].message.content.trim();
      console.log(`Summarization successful. Original length: ${thought.length}, Summary length: ${summary.length}`);
      return summary;
    } else {
      console.warn("Summarization failed: No content in response.");
      return thought; // Return original if summarization fails
    }
  } catch (error: any) {
    console.error("Error during summarization API call:", error.response?.data || error.message);
    return thought; // Return original on error
  }
}


/**
 * Preprocesses a thought string for Gemini Pro 2.5.
 * Applies redundancy removal and potentially summarization.
 * @param thought The original thought string.
 * @returns A promise resolving to the preprocessed thought string.
 */
export async function preprocessForGemini(thought: string): Promise<string> {
  console.log('Preprocessing thought for Gemini Pro 2.5...');

  // 1. Basic Redundancy Removal
  console.log('Applying redundancy removal...');
  const redundancyPatterns = [
    /\b(?:just|really|actually|basically|literally|like|you know|I mean|sort of|kind of)\b/gi,
    /\b(?:in order to|due to the fact that|the point I am trying to make is|what I mean to say is)\b/gi,
    /\s+/g // Replace multiple spaces with a single space
  ];

  let processedThought = thought;

  redundancyPatterns.forEach(pattern => {
    if (pattern.source === '\\s+') {
      processedThought = processedThought.replace(pattern, ' ');
    } else {
      processedThought = processedThought.replace(pattern, '');
    }
  });
  processedThought = processedThought.trim();

  const lengthAfterRedundancy = processedThought.length;
  if (lengthAfterRedundancy !== thought.length) {
      console.log(`Length after redundancy removal: ${lengthAfterRedundancy} (Original: ${thought.length})`);
  }

  // 2. Summarization (if applicable and API key available)
  processedThought = await summarizeThoughtWithGemini(processedThought);

  return processedThought;
}

// Example of other potential functions (not implemented here)
// export function extractKeywords(thought: string): string[] { ... }
