import { getEmbeddings } from './embeddings.js';
import { cosineSimilarity, decompressContent } from './utils.js';
import { WorkingMemoryItem, ThoughtProcessingState, ProcessingStage } from './types.js';
import { addOrUpdateMemoryItems, searchLongTermMemory, SearchResultItem as LtmSearchResultItem } from './vectorStore.js'; // Import vector store functions and type
import { v4 as uuidv4 } from 'uuid';
import zlib from 'zlib';
import { promisify } from 'util'; // Keep promisify for gzip

// Promisify zlib methods
const gzip = promisify(zlib.gzip);
// const gunzip = promisify(zlib.gunzip); // Removed, now in utils.ts

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
 * Generates embeddings for text using the configured embedding service.
 * @param text The text to process.
 * @returns An embedding vector.
 */
async function generateEmbeddingsForText(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    console.warn("Attempted to generate embeddings for empty text.");
    return [];
  }
  try {
    // Log only the beginning of potentially long text
    console.log("Generating embeddings for text snippet:", text.substring(0, 100) + (text.length > 100 ? "..." : ""));
    const embeddings = await getEmbeddings(text);
    console.log("Embeddings vector length:", embeddings.length);
    return embeddings;
  } catch (error) {
    console.error("Error generating embeddings:", error);
    return [];
  }
}

/**
 * Compresses content using gzip.
 */
async function compressContent(content: string): Promise<Buffer> {
  return await gzip(Buffer.from(content, 'utf-8'));
} // <<< Added missing closing brace

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

  // --- Add to Long-Term Memory (Vector Store) ---
  try {
    console.log(`Generating embedding for long-term storage of item ${newItem.id}...`);
    const fullContentEmbedding = await generateEmbeddingsForText(trimmedContent);

    if (fullContentEmbedding && fullContentEmbedding.length > 0) {
      await addOrUpdateMemoryItems([{
        id: newItem.id,
        text: trimmedContent, // Store full original text
        vector: fullContentEmbedding,
        metadata_timestamp: new Date(newItem.metadata.timestamp), // Convert number to Date object
        metadata_stage: newItem.metadata.stage,
      }]);
      console.log(`Successfully queued item ${newItem.id} for long-term memory.`);
    } else {
      console.warn(`Could not generate embedding for item ${newItem.id}. Skipping long-term memory storage.`);
    }
  } catch (vectorStoreError) {
    console.error(`Error adding item ${newItem.id} to long-term memory:`, vectorStoreError);
    // Do not block working memory update if vector store fails
  }
  // --- End Long-Term Memory Add ---


  return {
    ...state,
    workingMemory: updatedWorkingMemory,
  };
} // <<< Added missing closing brace

// Define a combined structure for ranking items from both sources
interface RankedMemoryItem {
    id: string;
    content: string; // Can be summary or full text
    compressedContent?: Buffer | null; // Only from working memory (make nullable)
    metadata: WorkingMemoryItem['metadata'];
    score: number;
    source: 'working' | 'long-term';
}


/**
 * Retrieves relevant items from both working memory and long-term memory (vector store).
 * Combines results, deduplicates, and ranks them.
 */
export async function retrieveRelevantMemory(
  state: ThoughtProcessingState,
  query: string,
  topN: number = RETRIEVAL_TOP_N,
  ltmTopN: number = RETRIEVAL_TOP_N // How many results to fetch from LTM initially
): Promise<WorkingMemoryItem[]> {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    console.warn("Empty query provided for memory retrieval. Returning most recent working memory items.");
    return state.workingMemory
      .sort((a, b) => b.metadata.timestamp - a.metadata.timestamp)
      .slice(0, topN);
  }

  console.log("\nProcessing query for relevant memory:", query.substring(0, 100) + (query.length > 100 ? "..." : ""));
  const queryEmbedding = await generateEmbeddingsForText(query);
  console.log("Query embedding vector length:", queryEmbedding?.length || 0);

  if (!queryEmbedding || queryEmbedding.length === 0) {
      console.warn("Could not generate query embedding. Cannot retrieve memory.");
      return [];
  }

  // --- Retrieve from Working Memory ---
  let workingMemoryResults: RankedMemoryItem[] = [];
  if (state.workingMemory.length > 0) {
      console.log("Retrieving from Working Memory...");
      // Calculate time range for recency bonus normalization
      const timestamps = state.workingMemory.map(i => i.metadata.timestamp);
      const minTimestamp = Math.min(...timestamps);
      const maxTimestamp = Math.max(...timestamps);
      const timeRange = Math.max(1, maxTimestamp - minTimestamp); // Avoid division by zero

      // Score each working memory item
      const scoredWorkingItems = await Promise.all(
          state.workingMemory.map(async (item): Promise<RankedMemoryItem> => {
              let contentToEmbed = item.content; // Default to summary
              let fullContentFetched = false;
              if (item.compressedContent) {
                  try {
                      // console.log(`Decompressing content for working memory item ${item.id}...`);
                      contentToEmbed = await decompressContent(item.compressedContent);
                      fullContentFetched = true;
                  } catch (decompressionError) {
                      console.error(`Error decompressing working memory item ${item.id}, falling back to summary:`, decompressionError);
                  }
              }

              // console.log(`\nProcessing working memory item ${item.id} (using ${fullContentFetched ? 'full content' : 'summary'}).`);
              const itemEmbedding = await generateEmbeddingsForText(contentToEmbed);
              let finalScore = 0;

              if (itemEmbedding && itemEmbedding.length > 0) {
                  const similarity = cosineSimilarity(queryEmbedding, itemEmbedding);
                  const normalizedTimestamp = (item.metadata.timestamp - minTimestamp) / timeRange;
                  const recencyBonus = normalizedTimestamp * RECENCY_WEIGHT;
                  finalScore = similarity + recencyBonus;
                  // console.log(`WM Item ${item.id}: Similarity=${similarity.toFixed(3)}, RecencyBonus=${recencyBonus.toFixed(3)}, FinalScore=${finalScore.toFixed(3)}`);
                  item.metadata.relevanceScore = finalScore; // Update relevance score in metadata
              } else {
                  console.warn(`No embeddings generated for working memory item ${item.id}`);
              }

              return {
                  id: item.id,
                  content: item.content, // Keep summary for working memory results initially
                  compressedContent: item.compressedContent,
                  metadata: item.metadata,
                  score: finalScore,
                  source: 'working'
              };
          })
      );
      workingMemoryResults = scoredWorkingItems.filter(item => item.score >= MIN_RELEVANCE_SCORE_THRESHOLD);
      console.log(`Retrieved ${workingMemoryResults.length} relevant items from Working Memory (Threshold: ${MIN_RELEVANCE_SCORE_THRESHOLD}).`);
  } else {
       console.log("Working Memory is empty. Skipping retrieval.");
  }


  // --- Retrieve from Long-Term Memory (Vector Store) ---
  console.log("Retrieving from Long-Term Memory (Vector Store)...");
  const ltmResultsRaw = await searchLongTermMemory(queryEmbedding, ltmTopN);
  // Map LTM results to RankedMemoryItem structure
  const longTermMemoryResults: RankedMemoryItem[] = ltmResultsRaw
      .map((ltmItem: LtmSearchResultItem): RankedMemoryItem => ({ // Explicitly type ltmItem and return type
          id: ltmItem.id,
          content: ltmItem.text, // LTM stores full text
          compressedContent: null, // LTM results don't have compressed content
          metadata: { // Reconstruct metadata structure
              stage: ltmItem.metadata_stage as ProcessingStage, // Assuming stage is stored as string
              timestamp: ltmItem.metadata_timestamp.getTime(), // Convert Date back to number
              relevanceScore: ltmItem.score, // Use LTM score directly
              connections: [], // LTM doesn't store connections in this schema
              isCompressed: false, // LTM stores raw text
          },
          score: ltmItem.score, // LTM score is pure similarity
          source: 'long-term'
      }))
      .filter(item => item.score >= MIN_RELEVANCE_SCORE_THRESHOLD); // Apply threshold also to LTM results
  console.log(`Retrieved ${longTermMemoryResults.length} relevant items from Long-Term Memory (Threshold: ${MIN_RELEVANCE_SCORE_THRESHOLD}).`);


  // --- Combine and Deduplicate Results ---
  const combinedResults: { [id: string]: RankedMemoryItem } = {};

  // Add working memory results first (potentially higher score due to recency)
  for (const item of workingMemoryResults) {
      combinedResults[item.id] = item;
  }

  // Add long-term memory results, replacing if score is higher (unlikely due to recency bonus in WM)
  // or adding if not present
  for (const item of longTermMemoryResults) {
      if (!combinedResults[item.id] || item.score > combinedResults[item.id].score) {
          // If adding LTM item, ensure we have full content if possible
          // (It should already be full text from LTM search result)
          combinedResults[item.id] = item;
      }
  }

  const finalRankedList = Object.values(combinedResults)
      .sort((a, b) => b.score - a.score) // Sort by final score descending
      .slice(0, topN); // Take the overall top N

  console.info(
      `Combined Retrieval: ${finalRankedList.length} items (Top ${topN}). ` +
      `Sources: ${finalRankedList.map(i => i.source).join(', ')}`
  );

  // Map back to WorkingMemoryItem structure for compatibility with stage processors
  // Prioritize full content if available (from LTM or decompressed WM)
  const finalWorkingMemoryItems: WorkingMemoryItem[] = await Promise.all(finalRankedList.map(async rankedItem => {
       let finalContent = rankedItem.content;
       let finalCompressed = rankedItem.compressedContent; // Keep if from working memory
       let isSummary = false; // Flag to check if content is summary

       // Check if the content in rankedItem is the summary by comparing lengths or using the metadata flag
       if (rankedItem.metadata.isCompressed && rankedItem.content.length < SUMMARIZATION_THRESHOLD + 100) { // Heuristic check
            isSummary = true;
       }

       // If it came from working memory, is still a summary, and has compressed content, try decompressing
       if (rankedItem.source === 'working' && rankedItem.compressedContent && isSummary) {
            try {
                 console.log(`Decompressing final item ${rankedItem.id} for output...`);
                 finalContent = await decompressContent(rankedItem.compressedContent);
                 console.log(`Successfully decompressed final item ${rankedItem.id}.`);
            } catch (e) {
                 console.error(`Error decompressing final item ${rankedItem.id}, keeping summary: ${e}`);
            }
       }

       return {
           id: rankedItem.id,
           content: finalContent, // Use potentially decompressed/full content
           compressedContent: finalCompressed, // May be undefined if from LTM
           metadata: {
                ...rankedItem.metadata,
                relevanceScore: rankedItem.score // Ensure metadata score reflects final ranking score
           }
       };
  }));


  return finalWorkingMemoryItems;
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
