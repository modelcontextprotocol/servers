/**
 * Centralized configuration system for Sequential Thinking MCP Server
 * 
 * This module provides a unified way to access configuration values from
 * environment variables, configuration files, and default values.
 */

import * as fs from 'fs';
import * as path from 'path';

// Configuration interface
export interface ServerConfig {
  // Server settings
  server: {
    port: number;
    host: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    saveDir: string;
  };
  
  // API settings
  api: {
    openai: {
      apiKey: string;
      defaultModel: string;
      maxTokens: number;
      temperature: number;
      timeout: number;
      retryAttempts: number;
    };
    openrouter: {
      apiKey: string;
      defaultModel: string;
      maxTokens: number;
      temperature: number;
      timeout: number;
      retryAttempts: number;
    };
  };
  
  // Memory settings
  memory: {
    workingMemory: {
      maxSize: number;
      pruningThreshold: number;
      summarizationThreshold: number;
    };
    longTermMemory: {
      enabled: boolean;
      vectorDbPath: string;
      maxResults: number;
    };
  };
  
  // Processing settings
  processing: {
    maxThoughtDepth: number;
    defaultContextWindowSize: number;
    stageTimeouts: {
      preparation: number;
      analysis: number;
      synthesis: number;
      evaluation: number;
    };
  };
}

// Default configuration
const defaultConfig: ServerConfig = {
  server: {
    port: 3000,
    host: '0.0.0.0',
    logLevel: 'info',
    saveDir: path.join(process.cwd(), 'data'),
  },
  api: {
    openai: {
      apiKey: '',
      defaultModel: 'gpt-4-turbo',
      maxTokens: 4096,
      temperature: 0.7,
      timeout: 60000,
      retryAttempts: 3,
    },
    openrouter: {
      apiKey: '',
      defaultModel: 'anthropic/claude-3-opus:beta',
      maxTokens: 4096,
      temperature: 0.7,
      timeout: 60000,
      retryAttempts: 3,
    },
  },
  memory: {
    workingMemory: {
      maxSize: 100,
      pruningThreshold: 0.3,
      summarizationThreshold: 2000,
    },
    longTermMemory: {
      enabled: true,
      vectorDbPath: path.join(process.cwd(), 'data', 'vector-db'),
      maxResults: 5,
    },
  },
  processing: {
    maxThoughtDepth: 20,
    defaultContextWindowSize: 8192,
    stageTimeouts: {
      preparation: 30000,
      analysis: 60000,
      synthesis: 45000,
      evaluation: 30000,
    },
  },
};

/**
 * Configuration class that manages loading and accessing configuration values
 */
class ConfigManager {
  private config: ServerConfig;
  private configPath: string;
  private initialized: boolean = false;

  constructor() {
    this.config = JSON.parse(JSON.stringify(defaultConfig)); // Deep copy default config
    this.configPath = process.env.CONFIG_PATH || path.join(process.cwd(), 'config.json');
  }

  /**
   * Initialize the configuration system
   * Loads configuration from file and environment variables
   */
  public initialize(): void {
    if (this.initialized) {
      return;
    }

    // Load from config file if it exists
    this.loadFromFile();
    
    // Override with environment variables
    this.loadFromEnvironment();
    
    // Validate the configuration
    this.validateConfig();
    
    // Create necessary directories
    this.ensureDirectories();
    
    this.initialized = true;
    console.info('Configuration initialized successfully');
  }

  /**
   * Get the complete configuration object
   */
  public getConfig(): ServerConfig {
    if (!this.initialized) {
      this.initialize();
    }
    return this.config;
  }

  /**
   * Get a specific configuration value
   * @param path Dot-notation path to the configuration value
   * @param defaultValue Default value if the path doesn't exist
   */
  public get<T>(path: string, defaultValue?: T): T {
    if (!this.initialized) {
      this.initialize();
    }

    const parts = path.split('.');
    let current: any = this.config;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return defaultValue as T;
      }
      current = current[part];
    }

    return (current === undefined) ? defaultValue as T : current as T;
  }

  /**
   * Load configuration from a JSON file
   */
  private loadFromFile(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const fileConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        this.mergeConfig(fileConfig);
        console.info(`Loaded configuration from ${this.configPath}`);
      }
    } catch (error) {
      console.warn(`Failed to load configuration from file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load configuration from environment variables
   */
  private loadFromEnvironment(): void {
    // Server settings
    if (process.env.SERVER_PORT) {
      this.config.server.port = parseInt(process.env.SERVER_PORT, 10);
    }
    if (process.env.SERVER_HOST) {
      this.config.server.host = process.env.SERVER_HOST;
    }
    if (process.env.LOG_LEVEL && ['debug', 'info', 'warn', 'error'].includes(process.env.LOG_LEVEL)) {
      this.config.server.logLevel = process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error';
    }
    if (process.env.SAVE_DIR) {
      this.config.server.saveDir = process.env.SAVE_DIR;
    }

    // API settings
    if (process.env.OPENAI_API_KEY) {
      this.config.api.openai.apiKey = process.env.OPENAI_API_KEY;
    }
    if (process.env.OPENAI_MODEL) {
      this.config.api.openai.defaultModel = process.env.OPENAI_MODEL;
    }
    if (process.env.OPENROUTER_API_KEY) {
      this.config.api.openrouter.apiKey = process.env.OPENROUTER_API_KEY;
    }
    if (process.env.OPENROUTER_MODEL) {
      this.config.api.openrouter.defaultModel = process.env.OPENROUTER_MODEL;
    }

    // Memory settings
    if (process.env.WORKING_MEMORY_MAX_SIZE) {
      this.config.memory.workingMemory.maxSize = parseInt(process.env.WORKING_MEMORY_MAX_SIZE, 10);
    }
    if (process.env.VECTOR_DB_PATH) {
      this.config.memory.longTermMemory.vectorDbPath = process.env.VECTOR_DB_PATH;
    }
  }

  /**
   * Merge a partial configuration object into the current configuration
   * @param partialConfig Partial configuration object to merge
   */
  private mergeConfig(partialConfig: Partial<ServerConfig>): void {
    // Cast partialConfig to object for deepMerge compatibility
    this.config = this.deepMerge(this.config, partialConfig as object) as ServerConfig;
  }

  /**
   * Deep merge two objects
   * @param target Target object
   * @param source Source object
   */
  private deepMerge(target: object, source: object): object {
    const output = { ...target };

    Object.keys(source).forEach((key) => {
      const targetValue = (target as any)[key];
      const sourceValue = (source as any)[key];

      if (this.isObject(targetValue) && this.isObject(sourceValue)) {
        (output as any)[key] = this.deepMerge(targetValue, sourceValue);
      } else {
        (output as any)[key] = sourceValue;
      }
    });

    return output;
  }

  /**
   * Check if a value is an object
   * @param item Value to check
   */
  private isObject(item: any): boolean {
    return (item && typeof item === 'object' && !Array.isArray(item));
  }

  /**
   * Validate the configuration
   * Throws an error if the configuration is invalid
   */
  private validateConfig(): void {
    // Validate server port
    if (this.config.server.port < 0 || this.config.server.port > 65535) {
      throw new Error(`Invalid server port: ${this.config.server.port}`);
    }

    // Validate API settings
    if (this.config.api.openai.maxTokens < 1) {
      throw new Error(`Invalid OpenAI max tokens: ${this.config.api.openai.maxTokens}`);
    }
    if (this.config.api.openrouter.maxTokens < 1) {
      throw new Error(`Invalid OpenRouter max tokens: ${this.config.api.openrouter.maxTokens}`);
    }

    // Validate memory settings
    if (this.config.memory.workingMemory.maxSize < 1) {
      throw new Error(`Invalid working memory max size: ${this.config.memory.workingMemory.maxSize}`);
    }
    if (this.config.memory.workingMemory.pruningThreshold < 0 || this.config.memory.workingMemory.pruningThreshold > 1) {
      throw new Error(`Invalid pruning threshold: ${this.config.memory.workingMemory.pruningThreshold}`);
    }
  }

  /**
   * Ensure that necessary directories exist
   */
  private ensureDirectories(): void {
    const dirs = [
      this.config.server.saveDir,
      this.config.memory.longTermMemory.vectorDbPath
    ];

    for (const dir of dirs) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          console.info(`Created directory: ${dir}`);
        }
      } catch (error) {
        console.warn(`Failed to create directory ${dir}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

// Export a singleton instance
export const configManager = new ConfigManager();

// Export convenience functions
export function getConfig(): ServerConfig {
  return configManager.getConfig();
}

export function get<T>(path: string, defaultValue?: T): T {
  return configManager.get<T>(path, defaultValue);
}
