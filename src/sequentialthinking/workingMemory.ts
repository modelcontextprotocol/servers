import { getEmbeddings } from './embeddings.js';
import { cosineSimilarity } from './utils.js';
import { WorkingMemoryItem, ThoughtProcessingState, ProcessingStage } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import zlib from 'zlib';
import { promisify } from 'util';

// Promisify zlib methods
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// Text summarization threshold (characters)
const SUMMARIZATION_THRESHOLD = 1000;
const SUMMARY_TARGET_LENGTH = 500;

// Configuration (Consider moving to a dedicated config file or env vars)
const MAX_WORKING_MEMORY_SIZE = parseInt(process.env.MAX_MEMORY_SIZE || '50', 10);
const RETRIEVAL_TOP_N = parseInt(process.env.RETRIEVAL_TOP_N || '5', 10);
const MIN_RELEVANCE_SCORE_THRESHOLD = parseFloat(process.env.MIN_RELEVANCE_THRESHOLD || '0.15');
const RECENCY_WEIGHT = parseFloat(process.env.RECENCY_WEIGHT || '0.2'); // Weight for recency bonus (0-1)
const PRUNING_RELEVANCE_THRESHOLD = parseFloat(process.env.PRUNING_RELEVANCE_THRESHOLD || '0.1'); // Items below this score are candidates for pruning if old

// More comprehensive stop words set
const STOP_WORDS = new Set(['the', 'a', 'an', 'is', 'are', 'to', 'in', 'on', 'for', 'with', 'of', 'and', 'or', 'it', 'this', 'that', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'hers', 'its', 'our', 'their', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'any', 'as', 'at', 'because', 'before', 'below', 'between', 'both', 'but', 'by', 'down', 'during', 'each', 'few', 'from', 'further', 'here', 'how', 'if', 'into', 'just', 'like', 'more', 'most', 'no', 'nor', 'not', 'now', 'only', 'other', 'out', 'over', 'own', 'same', 'so', 'some', 'such', 'than', 'then', 'there', 'these', 'those', 'through', 'under', 'until', 'up', 'very', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', '', 'input', 'output', 'thought', 'analysis', 'synthesis', 'evaluation', 'context', 'memory', 'task', 'results', 'scores', 'prompt', 'objective', 'provide', 'based', 'following', 'considering', 'none', 'available', 'stage', 'step', 'cycle', 'final', 'original', 'key', 'point', 'points', 'details', 'information']);

/**
 * Extracts embeddings for text.
 * @param text The text to process.
 * @returns An embedding vector.
 */
async function extractKeywordFrequencies(text: string): Promise<number[]> {
  try {
    console.log("Getting embeddings for:", text);
    const embeddings = await getEmbeddings(text);
    console.log("Embeddings vector length:", embeddings.length);
    return embeddings;
  } catch (error) {
    console.error("Error getting embeddings:", error);
    return [];
  }
}

/**
 * Compresses content using gzip.
 */
async function compressContent(content: string): Promise<Buffer> {
  return await gzip(Buffer.from(content, 'utf-8'));
}

/**
 * Decompresses content using gunzip.
 */
async function decompressContent(compressed: Buffer): Promise<string> {
  const decompressed = await gunzip(compressed);
  return decompressed.toString('utf-8');
}

/**
 * Summarizes text content if it exceeds the threshold.
 */
function summarizeContent(content: string): { summary: string, isCompressed: boolean } {
  if (content.length <= SUMMARIZATION_THRESHOLD) {
    return { summary: content, isCompressed: false };
  }

  // Simple summarization: keep first and last parts
  const halfTarget = Math.floor(SUMMARY_TARGET_LENGTH / 2);
  const firstHalf = content.slice(0, halfTarget);
  const secondHalf = content.slice(-halfTarget);
  const summary = `${firstHalf}... [${content.length - SUMMARY_TARGET_LENGTH} chars summarized] ...${secondHalf}`;
  
  return { summary, isCompressed: true };
}

/**
 * Adds a new item to the working memory with compression and summarization.
 */
export async function addToWorkingMemory(
  state: ThoughtProcessingState,
  content: string,
  metadata: Partial<WorkingMemoryItem['metadata']>
): Promise<ThoughtProcessingState> {
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    console.warn("Attempted to add empty or invalid content to working memory.");
    return state; // Don't add empty items
  }

  const trimmedContent = content.trim();
  const { summary, isCompressed } = summarizeContent(trimmedContent);
  const compressed = await compressContent(trimmedContent);

  const newItem: WorkingMemoryItem = {
    id: uuidv4(),
    content: summary, // Store summarized content for quick access
    compressedContent: compressed, // Store full compressed content
    metadata: {
      stage: metadata.stage || ProcessingStage.ANALYSIS,
      timestamp: metadata.timestamp || Date.now(),
      relevanceScore: metadata.relevanceScore || 0,
      connections: metadata.connections || [],
      isCompressed, // Track if content was summarized
    },
  };

  const updatedWorkingMemory = [...state.workingMemory, newItem];
  console.info(`Added item ${newItem.id} to working memory. New size: ${updatedWorkingMemory.length}`);

  return {
    ...state,
    workingMemory: updatedWorkingMemory,
  };
}

/**
 * Retrieves relevant items using embedding similarity and recency bonus.
 */
export async function retrieveRelevantMemory(
  state: ThoughtProcessingState,
  query: string,
  topN: number = RETRIEVAL_TOP_N
): Promise<WorkingMemoryItem[]> {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    console.warn("Empty query provided for memory retrieval. Returning most recent items.");
    return state.workingMemory
      .sort((a, b) => b.metadata.timestamp - a.metadata.timestamp)
      .slice(0, topN);
  }

  console.log("\nProcessing query for relevant memory:", query);
  const queryEmbedding = await extractKeywordFrequencies(query);
  console.log("Query embedding vector length:", queryEmbedding.length);

  if (state.workingMemory.length === 0 || !queryEmbedding || queryEmbedding.length === 0) {
    console.warn("No memory or query embeddings to retrieve from.");
    return []; // No memory or query embeddings to retrieve from
  }

  // Calculate time range for recency bonus normalization
  const timestamps = state.workingMemory.map(i => i.metadata.timestamp);
  const minTimestamp = Math.min(...timestamps);
  const maxTimestamp = Math.max(...timestamps);
  const timeRange = Math.max(1, maxTimestamp - minTimestamp); // Avoid division by zero

  // Score each memory item based on embedding similarity and recency
  const scoredItems = await Promise.all(
    state.workingMemory.map(async (item) => {
      console.log("\nProcessing memory item:", item.content);
      const itemEmbedding = await extractKeywordFrequencies(item.content);
      if (!itemEmbedding || itemEmbedding.length === 0) {
        console.warn("No embeddings generated for item");
        return { ...item, score: 0 }; // Skip scoring if item embedding is empty
      }
      const similarity = cosineSimilarity(queryEmbedding, itemEmbedding);
      console.log(`Cosine similarity between query and item: ${similarity}`);
      const normalizedTimestamp = (item.metadata.timestamp - minTimestamp) / timeRange;
      const recencyBonus = normalizedTimestamp * RECENCY_WEIGHT;
      const finalScore = similarity + recencyBonus;
      console.log("Recency bonus:", recencyBonus);
      console.log("Final score:", finalScore);
      item.metadata.relevanceScore = finalScore; // Update relevance score in metadata
      return { ...item, score: finalScore };
    })
  );

  const relevantItems = scoredItems
    .filter(item => item.score >= MIN_RELEVANCE_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  console.info(
    `Retrieved ${relevantItems.length} relevant items (Top ${topN}, Threshold ${MIN_RELEVANCE_SCORE_THRESHOLD}) for query: "${query.substring(0, 50)}..."`
  );
  return relevantItems;
}

/**
 * Prunes working memory using a combined relevance and LRU strategy.
 */
export function pruneWorkingMemory(
  state: ThoughtProcessingState,
  maxSize: number = MAX_WORKING_MEMORY_SIZE
): ThoughtProcessingState {
  let currentMemory = [...state.workingMemory]; // Create a mutable copy

  if (currentMemory.length <= maxSize) {
    return state; // No pruning needed
  }

  console.info(`Pruning working memory from ${currentMemory.length} items (Max size: ${maxSize}).`);

  // --- Combined Pruning Strategy ---
  // 1. Identify candidates for removal: old AND low relevance
  const now = Date.now();
  const ageThreshold = 1000 * 60 * 60 * 2; // Example: 2 hours old
  let candidates = currentMemory.filter(item => (now - item.metadata.timestamp > ageThreshold) && (item.metadata.relevanceScore || 0) < PRUNING_RELEVANCE_THRESHOLD);

  // Sort candidates by oldest first
  candidates.sort((a, b) => a.metadata.timestamp - b.metadata.timestamp);

  // 2. Remove candidates until maxSize is reached (or no more candidates)
  let removedCount = 0;
  const candidateIdsToRemove = new Set<string>();
  for (const candidate of candidates) {
    if (currentMemory.length - candidateIdsToRemove.size <= maxSize) {
      break; // Stop if we've removed enough
    }
    candidateIdsToRemove.add(candidate.id);
    removedCount++;
  }

  currentMemory = currentMemory.filter(item => !candidateIdsToRemove.has(item.id));
  if (removedCount > 0) {
    console.info(`Pruned ${removedCount} old/low-relevance items.`);
  }

  // 3. If still over maxSize, apply pure LRU (remove oldest remaining)
  if (currentMemory.length > maxSize) {
    const itemsToRemove = currentMemory.length - maxSize;
    // Sort remaining items by timestamp (oldest first)
    currentMemory.sort((a, b) => a.metadata.timestamp - b.metadata.timestamp);
    // Remove the oldest ones
    currentMemory = currentMemory.slice(itemsToRemove);
    console.info(`Applied LRU pruning for ${itemsToRemove} additional items.`);
  }

  console.info(`Working memory pruned to ${currentMemory.length} items.`);
  return {
    ...state,
    workingMemory: currentMemory,
  };
}
