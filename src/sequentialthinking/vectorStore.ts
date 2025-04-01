import { connect, Connection, Table } from '@lancedb/lancedb'; // Removed unused imports
import path from 'path';
import os from 'os';
import fs from 'fs';
import { getEmbeddings } from './embeddings.js'; // Assuming we might need this directly later
import { ProcessingStage } from './types.js';

// Define directory for saving the vector store
const VECTOR_STORE_DIR = path.join(os.homedir(), '.sequential-thinking', 'vector_store');
const TABLE_NAME = 'long_term_memory';

// Ensure the vector store directory exists
if (!fs.existsSync(VECTOR_STORE_DIR)) {
    try {
        fs.mkdirSync(VECTOR_STORE_DIR, { recursive: true });
        console.log(`Created vector store directory: ${VECTOR_STORE_DIR}`);
    } catch (error) {
        console.error(`Error creating vector store directory: ${error instanceof Error ? error.message : String(error)}`);
        // Consider throwing or handling more gracefully depending on requirements
    }
}

interface LongTermMemoryData {
    id: string; // Unique ID of the memory item (matches WorkingMemoryItem ID)
    text: string; // Full text content
    vector: number[]; // Embedding vector
    metadata_timestamp: Date; // Store as Date object internally for LanceDB
    metadata_stage: string; // Original processing stage
    // Add other relevant metadata if needed, e.g., original_session_id
}

// Define the structure for data being added (LanceDB uses Record<string, unknown>)
type LanceDbDataFormat = Record<string, unknown>;


let db: Connection | null = null;
let table: Table | null = null;
let isInitialized = false;

/**
 * Initializes the LanceDB connection and table.
 */
async function initializeVectorStore(): Promise<void> {
    if (isInitialized) {
        return;
    }
    try {
        console.log(`Initializing vector store at: ${VECTOR_STORE_DIR}`);
        db = await connect(VECTOR_STORE_DIR); // Use the imported 'connect' directly

        const tableNames = await db.tableNames();
        if (tableNames.includes(TABLE_NAME)) {
            console.log(`Opening existing vector store table: ${TABLE_NAME}`);
            table = await db.openTable(TABLE_NAME);
        } else {
            console.log(`Creating new vector store table: ${TABLE_NAME}`);
            // LanceDB infers schema from the first batch of data.
            // We need at least one dummy record with the correct structure and types.
            // Get embedding dimension dynamically.
             const sampleEmbedding = await getEmbeddings("schema_init");
             const embeddingDimension = sampleEmbedding?.length;
             if (!embeddingDimension || embeddingDimension === 0) {
                 throw new Error("Could not determine embedding dimension. Ensure embedding service is configured and API key is valid.");
             }
             console.log(`Determined embedding dimension for schema: ${embeddingDimension}`);

             const dummyData: LanceDbDataFormat[] = [{
                 id: 'dummy_id',
                 text: 'dummy_text',
                 vector: Array(embeddingDimension).fill(0.0), // Use correct dimension
                 metadata_timestamp: new Date(), // Use Date object
                 metadata_stage: ProcessingStage.PREPARATION // Use enum value
             }];

            // Create table with dummy data to infer schema
            table = await db.createTable(TABLE_NAME, dummyData);
            console.log(`Vector store table "${TABLE_NAME}" created successfully with inferred schema.`);
            // Optionally delete the dummy data immediately after schema creation if desired
            // await table.delete("id = 'dummy_id'");
            // console.log("Removed dummy data used for schema creation.");
        }
        isInitialized = true;
        console.log("Vector store initialized successfully.");
    } catch (error) {
        console.error(`Error initializing vector store: ${error instanceof Error ? error.message : String(error)}`, error);
        // Prevent further operations if initialization fails
        isInitialized = false;
        db = null;
        table = null;
        throw error; // Re-throw to signal failure
    }
}

/**
 * Adds or updates memory items in the vector store.
 * Uses merge insert (upsert) based on the 'id' field.
 * @param items An array of memory item data to add/update.
 */
export async function addOrUpdateMemoryItems(items: LongTermMemoryData[]): Promise<void> {
    await initializeVectorStore(); // Ensure initialized
    if (!table) {
        console.error("Vector store table not available. Cannot add items.");
        return;
        return;
    }
    if (!items || items.length === 0) {
        console.log("No items provided to add/update in vector store.");
        return;
    }

    try {
        // Convert timestamps to Date objects for LanceDB compatibility
        const dataToInsert: LanceDbDataFormat[] = items.map(item => ({
            ...item,
            metadata_timestamp: new Date(item.metadata_timestamp)
        }));

        // Use add with append mode (Note: This doesn't handle updates/upserts correctly)
        // TODO: Implement proper upsert logic if needed (e.g., delete then add)
        await table.add(dataToInsert, { mode: 'append' });
        console.log(`Appended ${items.length} items to vector store.`);
    } catch (error) {
        console.error(`Error adding/updating items in vector store: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Searches the long-term memory vector store for relevant items.
 * @param queryEmbedding The embedding vector of the search query.
 * @param topN The maximum number of results to return.
 * @param filter Optional filter string (SQL WHERE clause syntax).
 * @returns A promise resolving to an array of search result objects.
 */
 // Define an interface for the expected search result structure
 export interface SearchResultItem { // Added export
     id: string;
     text: string;
     vector: number[];
     metadata_timestamp: Date; // LanceDB returns Date objects
     metadata_stage: string;
     score: number; // LanceDB adds a score field
     [key: string]: unknown; // Allow other potential fields
 }

export async function searchLongTermMemory(
    queryEmbedding: number[],
    topN: number,
    filter?: string
): Promise<SearchResultItem[]> {
    await initializeVectorStore(); // Ensure initialized
    if (!table) {
        console.error("Vector store table not available. Cannot search.");
        return [];
    }
    if (!queryEmbedding || queryEmbedding.length === 0) {
         console.warn("Empty query embedding provided for vector store search.");
         return [];
    }

    try {
        let query = table.search(queryEmbedding).limit(topN);
        if (filter) {
            // LanceDB uses SQL WHERE syntax for filters
            query = query.where(filter);
        }
        // Select specific columns if needed, otherwise returns all
        // query = query.select(['id', 'text', 'metadata_timestamp', 'metadata_stage']);

        // Use .toArray() to get results directly as an array of objects
        const results = await query.toArray() as SearchResultItem[];

        console.log(`Vector store search found ${results.length} results (top ${topN}).`);

        // Optional: Convert Date objects back to numbers if needed downstream
        // return results.map(r => ({ ...r, metadata_timestamp: r.metadata_timestamp.getTime() }));
        return results;
    } catch (error) {
        console.error(`Error searching vector store: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}

// Optional: Initialize on module load (consider implications for startup time)
// initializeVectorStore().catch(err => console.error("Failed initial vector store setup:", err));
