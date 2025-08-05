import { IStorageBackend, IStorageConfig, IStorageFactory } from './interface.js';
import { JSONStorage } from './json-storage.js';
import { SQLiteStorage } from './sqlite-storage.js';

/**
 * Factory for creating storage backends based on configuration.
 */
export class StorageFactory implements IStorageFactory {
  async create(config: IStorageConfig): Promise<IStorageBackend> {
    let backend: IStorageBackend;

    switch (config.type) {
      case 'json':
        backend = new JSONStorage(config);
        break;
      
      case 'sqlite':
        backend = new SQLiteStorage(config);
        break;
      
      case 'postgres':
        throw new Error('PostgreSQL storage backend not yet implemented');
      
      case 'custom':
        throw new Error('Custom storage backends not yet implemented');
      
      default:
        throw new Error(`Unsupported storage type: ${config.type}`);
    }

    // Initialize the backend
    await backend.initialize();
    
    return backend;
  }
}

/**
 * Create a storage backend based on configuration.
 * This is a convenience function that doesn't auto-initialize.
 */
export function createStorage(config: IStorageConfig): IStorageBackend {
  switch (config.type) {
    case 'json':
      return new JSONStorage(config);
    
    case 'sqlite':
      return new SQLiteStorage(config);
    
    case 'postgres':
      throw new Error('PostgreSQL storage backend not yet implemented');
    
    case 'custom':
      throw new Error('Custom storage backends not yet implemented');
    
    default:
      throw new Error(`Unsupported storage type: ${config.type}`);
  }
}

/**
 * Create a storage backend from environment configuration.
 */
export function createStorageFromEnv(): IStorageBackend {
  // Determine storage type from environment
  const storageType = (process.env.STORAGE_TYPE || 'json').toLowerCase().trim();
  
  // Build configuration based on storage type
  const config: IStorageConfig = {
    type: storageType as any,
  };

  // Add type-specific configuration
  switch (storageType) {
    case 'json':
      config.filePath = process.env.JSON_PATH || process.env.MEMORY_FILE_PATH || 'memory.jsonl';
      break;
    
    case 'sqlite':
      config.filePath = process.env.SQLITE_PATH || 'memory.db';
      break;
    
    case 'postgres':
      config.connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
      throw new Error('PostgreSQL storage backend not yet implemented');
    
    default:
      throw new Error(`Unsupported storage type: ${storageType}`);
  }

  return createStorage(config);
}