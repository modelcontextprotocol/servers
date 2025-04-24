import fs from 'fs';
import path from 'path';
import { getDocumentContent } from './getDocumentContent.js';
import { extractFileId } from './extractFileId.js';

export interface SavedDocumentResult {
  success: boolean;
  message: string;
  filePath?: string;
  documentName?: string;
}

/**
 * Saves a Google Docs document as a Markdown file for use as reference context
 * @param fileIdOrUrl - The document ID, URL, or URI (gdrive:///{id})
 * @param outputDir - Optional directory to save the file (defaults to ./saved_documents)
 * @returns Promise with the result of the save operation
 */
export async function saveDocument(fileIdOrUrl: string, outputDir?: string): Promise<SavedDocumentResult> {
  try {
    // Extract the file ID from the provided input
    const fileId = extractFileId(fileIdOrUrl);
    
    // Get the document content
    const documentData = await getDocumentContent(fileId);
    
    // Create a safe filename based on the document name
    const safeFileName = documentData.name
      .replace(/[^a-z0-9áéíóúñü ]/gi, '') // Remove special characters except spaces and accented letters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .toLowerCase();
    
    // Determine the output directory
    const saveDir = outputDir || path.join(process.cwd(), './tmp');
    
    // Create the directory if it doesn't exist
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }
    
    // Create the full file path
    const filePath = path.join(saveDir, `${safeFileName}_${fileId}.md`);
    
    // Add metadata at the top of the file
    const metadata = `---
` +
      `title: ${documentData.name}
` +
      `document_id: ${fileId}
` +
      `uri: ${documentData.uri}
` +
      `saved_at: ${new Date().toISOString()}
` +
      `---

`;
    
    // Write the file with metadata and content
    fs.writeFileSync(filePath, metadata + documentData.content);
    
    return {
      success: true,
      message: `Document successfully saved to ${filePath}`,
      filePath,
      documentName: documentData.name
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Error saving document: ${errorMessage}`
    };
  }
}
