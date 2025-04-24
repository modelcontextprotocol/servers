import { google, GoogleApis } from "googleapis";
import { extractFileId } from "./extractFileId.js";
import { parseDoc } from './documentToText.js';
const drive = google.drive("v3");

export interface DocumentData {
  content: string;
  name: string;
  mimeType: string;
  uri: string;
}

// Simple in-memory cache for document content
const documentCache = new Map<string, DocumentData>();

export async function getDocumentContent(fileIdOrUrl: string): Promise<DocumentData> {
  const fileId = extractFileId(fileIdOrUrl);
  
  // Check if we already have the content cached
  if (documentCache.has(fileId)) {
    return documentCache.get(fileId)!;
  }
  
  // First get file metadata to check mime type
  const file = await drive.files.get({
    fileId,
    fields: "mimeType,name",
  });
  
  // Only proceed if it's a Google Doc
  if (file.data.mimeType !== "application/vnd.google-apps.document") {
    throw new Error("This tool only works with Google Docs documents");
  }
  
  // Export as markdown
  const res = await drive.files.export(
    { fileId, mimeType: "text/markdown" },
    { responseType: "text" },
  );
  
  // Store in cache
  const documentData: DocumentData = {
    content: res.data as string,
    name: file.data.name as string,
    mimeType: file.data.mimeType as string,
    uri: `gdrive:///${fileId}`,
  };
  
  documentCache.set(fileId, documentData);
  return documentData;
}

/**
 * Fetches the content of a Google Doc.
 * @param {string} documentId The ID of the document to fetch.
 * @returns {Promise<object|null>} The document object or null if an error occurs.
 */
export async function getDocument(google_api: GoogleApis, documentId: string): Promise<DocumentData> {
  const docs = google_api.docs('v1');
  console.log(`Workspaceing document with ID: ${documentId}`);
  try {
    const res = await docs.documents.get({
      documentId: documentId,
      includeTabsContent: true, // Include content from all tabs
      // Use fields parameter to potentially limit data transfer,
      // but for parsing we usually need the full body.
      // fields: 'body(content)', // Example: Get only body content
    });
    console.log('Successfully fetched document data.');
    // return res.data; // Contains title, body, etc.

    // const doc = JSON.stringify(res.data);
    const content = parseDoc(res.data);
      // Store in cache
    const documentData: DocumentData = {
      content: content,
      name: res.data.title as string,
      // mimeType: 'application/vnd.google-apps.document',
      mimeType: 'text/markdown',
      uri: `gdrive:///${documentId}`,
    };
    
    documentCache.set(documentId, documentData);
    return documentData;
  } catch (err: unknown) {
    console.error(`Error fetching document (ID: ${documentId}):`, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
