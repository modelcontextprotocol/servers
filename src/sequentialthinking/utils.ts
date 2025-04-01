import zlib from 'zlib';
import { promisify } from 'util';

// Promisify zlib methods
const gunzip = promisify(zlib.gunzip);


/**
 * Decompresses content using gunzip.
 * @param compressed The compressed buffer.
 * @returns A Promise resolving to the decompressed string.
 */
export async function decompressContent(compressed: Buffer): Promise<string> {
  const decompressed = await gunzip(compressed);
  return decompressed.toString('utf-8');
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}
