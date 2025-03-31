import * as dotenv from 'dotenv';
import { getEmbeddings } from './embeddings.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get the directory path of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env file at project root
const envPath = path.resolve(__dirname, '../../../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

async function testEmbeddings() {
  const testText = "This is a test of the embeddings functionality";
  
  console.log("Testing embeddings with text:", testText);
  
  try {
    const embeddings = await getEmbeddings(testText);
    console.log("\nEmbeddings generated successfully!");
    console.log("Embeddings length:", embeddings.length);
    console.log("First 5 values:", embeddings.slice(0, 5));
  } catch (error) {
    console.error("Error testing embeddings:", error);
  }
}

testEmbeddings();
