import { describe, it, expect } from 'vitest';
import { crc32, inflateSync } from 'node:zlib';
import { MCP_TINY_IMAGE } from '../tools/get-tiny-image.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface PngChunk {
  type: string;
  data: Buffer;
  storedCrc: number;
  computedCrc: number;
}

// Splits a PNG into its chunk records: length, type, data and CRC.
function readChunks(png: Buffer): PngChunk[] {
  expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);

  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);

    chunks.push({
      type,
      data: png.subarray(offset + 8, offset + 8 + length),
      storedCrc: png.readUInt32BE(offset + 8 + length),
      computedCrc: crc32(png.subarray(offset + 4, offset + 8 + length)),
    });
    offset += 12 + length;
  }

  expect(offset).toBe(png.length);
  expect(chunks[chunks.length - 1].type).toBe('IEND');
  return chunks;
}

describe('MCP_TINY_IMAGE', () => {
  const png = Buffer.from(MCP_TINY_IMAGE, 'base64');

  it('should hold a correct CRC-32 for every chunk', () => {
    const corrupted = readChunks(png)
      .filter((chunk) => chunk.storedCrc !== chunk.computedCrc)
      .map((chunk) => `${chunk.type}: stored 0x${chunk.storedCrc.toString(16)}, computed 0x${chunk.computedCrc.toString(16)}`);

    expect(corrupted).toEqual([]);
  });

  it('should hold a decompressible iCCP profile', () => {
    const iccp = readChunks(png).filter((chunk) => chunk.type === 'iCCP');
    expect(iccp).toHaveLength(1);

    const profileNameEnd = iccp[0].data.indexOf(0);
    expect(iccp[0].data[profileNameEnd + 1]).toBe(0);
    expect(() => inflateSync(iccp[0].data.subarray(profileNameEnd + 2))).not.toThrow();
  });
});
