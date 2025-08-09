import { createHash, getHashes } from "crypto";
import { createReadStream } from "fs";
import fs from "fs/promises";

// Hashing utility
type HashAlgorithm = "md5" | "sha1" | "sha256";
export async function getFileHash(
  filePath: string,
  algorithm: HashAlgorithm,
  encoding: "hex" | "base64" = "hex"
): Promise<string> {
  const algo = algorithm.toLowerCase() as HashAlgorithm;
  
  // Fail early if Node/OpenSSL is not supported (FIPS/Builds)
  const available = new Set(getHashes().map(h => h.toLowerCase()));
  if (!available.has(algo)) {
    throw new Error(
      `Algorithm '${algo}' is not available in this Node/OpenSSL build (FIPS or policy may disable it).`
    );
  }

  // Allow only regular files (throw a clear error if not)
  const st = await fs.stat(filePath);
  if (!st.isFile()) {
    throw new Error(`Path is not a regular file: ${filePath}`);
  }

  const hash = createHash(algo);
  const stream = createReadStream(filePath, { highWaterMark: 1024 * 1024 }); // 1 MiB

  return await new Promise<string>((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => {
      try {
        resolve(hash.digest(encoding));
      } catch (e) {
        reject(e);
      }
    });
  });
}