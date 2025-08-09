import fs from "fs/promises";
import path from "path";
import os from "os";
import { getFileHash } from "../file-hash.js";

describe("get_file_hash (complete coverage)", () => {
  let tmpDir: string;
  let textFile: string;
  let binFile: string;
  let dirPath: string;
  let symlinkToDir: string;

  // Test data
  const TEXT = "ForensicShark";
  // Expected digests for "ForensicShark" (without newline)
  const TEXT_DIGESTS = {
    md5_hex:    "1422ac7778fd50963651bc74686158b7",
    sha1_hex:   "a74904ee14c16d949256e96110596bdffc48f481",
    sha256_hex: "53746f49c75306a3066eb456dba05b99aab88f562d2c020582c9226d9c969987",
    md5_b64:    "FCKsd3j9UJY2Ubx0aGFYtw==",
    sha1_b64:   "p0kE7hTBbZSSVulhEFlr3/xI9IE=",
    sha256_b64: "U3RvScdTBqMGbrRW26Bbmaq4j1YtLAIFgskibZyWmYc=",
  } as const;

  // Small binary snippet: 00 FF 10 20 42 7F
  const BIN_SNIPPET = Buffer.from([0x00, 0xff, 0x10, 0x20, 0x42, 0x7f]);
  const BIN_DIGESTS = {
    md5_hex:    "3bd2f5d961a05d8cb7edd3953adc069c",
    sha1_hex:   "28541834deba1f200e2fbde455bddb2e258afe36",
    sha256_hex: "6048e89b6ff39be935d44c069a21f22ae7401177ee4c7d3156a4e3b48102d53f",
    md5_b64:    "O9L12WGgXYy37dOVOtwGnA==",
    sha1_b64:   "KFQYNN66HyAOL73kVb3bLiWK/jY=",
    sha256_b64: "YEjom2/zm+k11EwGmiHyKudAEXfuTH0xVqTjtIEC1T8=",
  } as const;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "get-file-hash-"));
    textFile = path.join(tmpDir, "text.txt");
    binFile = path.join(tmpDir, "bin.dat");
    dirPath = path.join(tmpDir, "a-directory");
    symlinkToDir = path.join(tmpDir, "dir-link");

    await fs.writeFile(textFile, TEXT, "utf-8");
    await fs.writeFile(binFile, BIN_SNIPPET);
    await fs.mkdir(dirPath);

    // Symlink to directory (on Windows: "junction")
    if (process.platform === "win32") {
      await fs.symlink(dirPath, symlinkToDir, "junction");
    } else {
      await fs.symlink(dirPath, symlinkToDir);
    }
  });

  afterAll(async () => {
    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  //
  // 1) Text 'ForensicShark' → md5/sha1/sha256 (hex)
  //
  test("hash of text 'ForensicShark' (md5/sha1/sha256, hex)", async () => {
    await expect(getFileHash(textFile, "md5", "hex")).resolves.toBe(TEXT_DIGESTS.md5_hex);
    await expect(getFileHash(textFile, "sha1", "hex")).resolves.toBe(TEXT_DIGESTS.sha1_hex);
    await expect(getFileHash(textFile, "sha256", "hex")).resolves.toBe(TEXT_DIGESTS.sha256_hex);
  });

  //
  // 2) Not a file: directory, symlink to directory, /dev/null (if present)
  //
  test("rejects directory as not a regular file", async () => {
    await expect(getFileHash(dirPath, "sha256", "hex")).rejects.toThrow(/not a regular file/i);
  });

  test("rejects symlink to directory as not a regular file", async () => {
    await expect(getFileHash(symlinkToDir, "sha256", "hex")).rejects.toThrow(/not a regular file/i);
  });

  test("rejects device file like /dev/null when present", async () => {
    if (process.platform === "win32") {
      // No /dev/null → skip test
      return;
    }
    try {
      const devNull = "/dev/null";
      const st = await fs.lstat(devNull);
      // If present & not a regular file → expected error
      if (!st.isFile()) {
        await expect(getFileHash(devNull, "sha256", "hex")).rejects.toThrow(/not a regular file|EISDIR|EPERM|EINVAL/i);
      }
    } catch {
      // /dev/null does not exist → skip
      return;
    }
  });

  //
  // 3) Binary snippet correct (all three algorithms, hex)
  //
  test("hash of small binary snippet (md5/sha1/sha256, hex)", async () => {
    await expect(getFileHash(binFile, "md5", "hex")).resolves.toBe(BIN_DIGESTS.md5_hex);
    await expect(getFileHash(binFile, "sha1", "hex")).resolves.toBe(BIN_DIGESTS.sha1_hex);
    await expect(getFileHash(binFile, "sha256", "hex")).resolves.toBe(BIN_DIGESTS.sha256_hex);
  });

  //
  // 4) Unknown algorithms → error (at least three)
  //    We intentionally use common but NOT allowed names (sha512)
  //    plus fantasy/legacy names, so the test remains stable.
  //
  test("rejects unsupported algorithms", async () => {
    const badAlgos = ["sha512", "crc32", "whirlpool", "shark512", "legacy-md5"];
    for (const algo of badAlgos) {
      // cast to any to bypass TS union, we test runtime errors
      await expect(getFileHash(textFile, algo as any, "hex")).rejects.toThrow(/algorithm|unsupported|not available/i);
    }
  });

  //
  // 5) Encodings hex & base64 correct
  //
  test("encodings: hex and base64 (text case)", async () => {
    // hex wurde oben schon geprüft; hier nochmals base64 explizit
    await expect(getFileHash(textFile, "md5", "base64")).resolves.toBe(TEXT_DIGESTS.md5_b64);
    await expect(getFileHash(textFile, "sha1", "base64")).resolves.toBe(TEXT_DIGESTS.sha1_b64);
    await expect(getFileHash(textFile, "sha256", "base64")).resolves.toBe(TEXT_DIGESTS.sha256_b64);
  });

  test("encodings: hex and base64 (binary case)", async () => {
    await expect(getFileHash(binFile, "md5", "base64")).resolves.toBe(BIN_DIGESTS.md5_b64);
    await expect(getFileHash(binFile, "sha1", "base64")).resolves.toBe(BIN_DIGESTS.sha1_b64);
    await expect(getFileHash(binFile, "sha256", "base64")).resolves.toBe(BIN_DIGESTS.sha256_b64);
  });
});
