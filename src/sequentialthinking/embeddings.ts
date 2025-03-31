import * as dotenv from 'dotenv';
import { OpenAIEmbeddings } from "@langchain/openai";
import * as path from 'path';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';

// Configure rate limiting
const MAX_CONCURRENT_REQUESTS = 5;
const rateLimiter = pLimit(MAX_CONCURRENT_REQUESTS);

// Get the directory path of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env file at project root
const envPath = path.resolve(__dirname, '../../../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log("OpenAI API Key status:", OPENAI_API_KEY ? "Set" : "Not set");

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: OPENAI_API_KEY,
  modelName: "text-embedding-3-small", // Using newer embedding model for improved performance
  maxRetries: 3 // Add retry mechanism
});

// Fallback embedding function using a simple approach
function generateSimpleEmbeddings(text: string): number[] {
  console.warn("Using fallback embedding method as OPENAI_API_KEY is not set");
  
  // Create a simple embedding based on word frequencies
  // This is a very basic approach and not as effective as proper embeddings
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const uniqueWords = [...new Set(words)];
  
  // Create a vector of 100 dimensions (much smaller than real embeddings)
  const embedding = new Array(100).fill(0);
  
  // Simple hash function to map words to vector positions
  for (const word of words) {
    const hashCode = word.split('').reduce((acc, char) => {
      return (acc * 31 + char.charCodeAt(0)) % 100;
    }, 0);
    
    embedding[hashCode] += 1;
  }
  
  // Normalize the vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = embedding[i] / magnitude;
    }
  }
  
  return embedding;
}

/**
 * Get embeddings from OpenAI API or fallback to simple method if API key not available
 * @param text The text to embed
 * @returns Array of embedding values
 */
/**
 * Get embeddings for a batch of texts in parallel with rate limiting
 * @param texts Array of texts to embed
 * @param options Configuration options
 * @returns Array of embedding arrays
 */
export async function getBatchEmbeddings(
  texts: string[],
  options: { 
    batchSize?: number;
    maxRetries?: number;
    retryDelay?: number;
  } = {}
): Promise<number[][]> {
  const {
    batchSize = 20,
    maxRetries = 3,
    retryDelay = 1000
  } = options;

  console.log(`Processing ${texts.length} texts in batches of ${batchSize}`);

  // Filter out empty texts
  const validTexts = texts.filter(text => text && text.trim().length > 0);
  if (validTexts.length === 0) return [];

  // Split into batches
  const batches: string[][] = [];
  for (let i = 0; i < validTexts.length; i += batchSize) {
    batches.push(validTexts.slice(i, i + batchSize));
  }

  // Process batches in parallel with rate limiting
  const results = await Promise.all(
    batches.map(async batch => {
      return await rateLimiter(async () => {
        const batchResults = await Promise.all(
          batch.map(async text => {
            let lastError;
            // Retry logic
            for (let attempt = 0; attempt < maxRetries; attempt++) {
              try {
                return await getEmbeddings(text);
              } catch (error) {
                lastError = error;
                console.warn(`Attempt ${attempt + 1}/${maxRetries} failed for text: ${text.substring(0, 50)}...`);
                if (attempt < maxRetries - 1) {
                  await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
                }
              }
            }
            console.error(`All ${maxRetries} attempts failed for text: ${text.substring(0, 50)}...`);
            console.error('Last error:', lastError);
            return generateSimpleEmbeddings(text); // Fallback to simple embeddings
          })
        );
        return batchResults;
      });
    })
  );

  // Flatten results
  return results.flat();
}

/**
 * Get embeddings for a single text
 * @param text The text to embed
 * @returns Array of embedding values
 */
export async function getEmbeddings(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    console.warn("Empty text provided for embeddings");
    return [];
  }

  console.log("\n=== Embedding Request ===");
  console.log("Input text:", text);
  console.log("OpenAI API Key:", OPENAI_API_KEY ? "Present" : "Missing");

  // Check OpenAI_API_KEY value right before fallback check
  console.log("Value of OPENAI_API_KEY before fallback check:", OPENAI_API_KEY);

  // If no API key is set, use the fallback method
  if (!OPENAI_API_KEY) {
    console.log("OpenAI API key IS NOT SET. Using fallback embeddings."); // More explicit log
    const fallbackEmbeddings = generateSimpleEmbeddings(text);
    console.log("Generated fallback embeddings with length:", fallbackEmbeddings.length);
    return fallbackEmbeddings;
  }

  try {
    console.log("Calling OpenAI API for embeddings using model: text-embedding-3-small");
    const res = await embeddings.embedQuery(text);
    console.log("Successfully received embeddings from OpenAI API"); // Added success log
    console.log("Embeddings vector length:", res.length);
    console.log("First few values:", res.slice(0, 5));
    return res;
  } catch (error: any) {
    console.error("Error getting embeddings from OpenAI:", error);
    console.warn(`Falling back to simple embeddings due to OpenAI error: ${error.message}`); // Modified fallback log
    if (error?.response?.status === 401) {
      console.error("Authentication error. Check your OpenAI API key.");
    } else if (error?.response?.status === 429) {
      console.error("Rate limit exceeded. Please try again later.");
    } else {
      console.error("Unknown error occurred:", error.message);
    }
    return generateSimpleEmbeddings(text);
  }
}
