// Helper function to extract file ID from various formats
export function extractFileId(fileIdOrUrl: string): string {
  // Handle URI format: gdrive:///{id}
  if (fileIdOrUrl.startsWith('gdrive:///')) {
    return fileIdOrUrl.replace('gdrive:///', '');
  }
  
  // Handle URL formats like https://docs.google.com/document/d/{id}/edit
  const urlMatch = fileIdOrUrl.match(/\/d\/([^\/]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }
  
  // Assume it's already a file ID
  return fileIdOrUrl;
}
