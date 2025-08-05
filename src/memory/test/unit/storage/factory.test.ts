import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStorage, createStorageFromEnv } from '../../../storage/factory.js';
import { JSONStorage } from '../../../storage/json-storage.js';
import { SQLiteStorage } from '../../../storage/sqlite-storage.js';
import * as path from 'path';
import { tmpdir } from 'os';

describe('Storage Factory', () => {
  describe('createStorage', () => {
    it('should create JSON storage with json type', () => {
      const storage = createStorage({
        type: 'json',
        filePath: 'test.jsonl'
      });
      expect(storage).toBeInstanceOf(JSONStorage);
    });

    it('should create SQLite storage with sqlite type', () => {
      const storage = createStorage({
        type: 'sqlite',
        filePath: 'test.db'
      });
      expect(storage).toBeInstanceOf(SQLiteStorage);
    });

    it('should throw error for unsupported storage type', () => {
      expect(() => createStorage({
        type: 'unsupported' as any,
        filePath: 'test.txt'
      })).toThrow('Unsupported storage type: unsupported');
    });

    it('should handle postgres type (future)', () => {
      expect(() => createStorage({
        type: 'postgres',
        connectionString: 'postgresql://localhost:5432/test'
      })).toThrow('PostgreSQL storage backend not yet implemented');
    });

    it('should handle custom type (future)', () => {
      expect(() => createStorage({
        type: 'custom',
        filePath: 'custom.db'
      })).toThrow('Custom storage backends not yet implemented');
    });
  });

  describe('createStorageFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create JSON storage by default', () => {
      delete process.env.STORAGE_TYPE;
      const storage = createStorageFromEnv();
      expect(storage).toBeInstanceOf(JSONStorage);
    });

    it('should create JSON storage when STORAGE_TYPE=json', () => {
      process.env.STORAGE_TYPE = 'json';
      process.env.JSON_PATH = path.join(tmpdir(), 'test.jsonl');
      const storage = createStorageFromEnv();
      expect(storage).toBeInstanceOf(JSONStorage);
    });

    it('should create SQLite storage when STORAGE_TYPE=sqlite', () => {
      process.env.STORAGE_TYPE = 'sqlite';
      process.env.SQLITE_PATH = path.join(tmpdir(), 'test.db');
      const storage = createStorageFromEnv();
      expect(storage).toBeInstanceOf(SQLiteStorage);
    });

    it('should use default paths when not specified', () => {
      process.env.STORAGE_TYPE = 'json';
      delete process.env.JSON_PATH;
      const storage = createStorageFromEnv();
      expect(storage).toBeInstanceOf(JSONStorage);
    });

    it('should handle invalid STORAGE_TYPE', () => {
      process.env.STORAGE_TYPE = 'invalid';
      expect(() => createStorageFromEnv()).toThrow();
    });

    it('should handle PostgreSQL configuration', () => {
      process.env.STORAGE_TYPE = 'postgres';
      process.env.POSTGRES_URL = 'postgresql://localhost:5432/test';
      expect(() => createStorageFromEnv()).toThrow('PostgreSQL storage backend not yet implemented');
    });

    it('should handle case-insensitive storage types', () => {
      process.env.STORAGE_TYPE = 'SQLITE';
      process.env.SQLITE_PATH = ':memory:';
      const storage = createStorageFromEnv();
      expect(storage).toBeInstanceOf(SQLiteStorage);
    });

    it('should trim whitespace from environment variables', () => {
      process.env.STORAGE_TYPE = '  sqlite  ';
      process.env.SQLITE_PATH = '  :memory:  ';
      const storage = createStorageFromEnv();
      expect(storage).toBeInstanceOf(SQLiteStorage);
    });
  });
});