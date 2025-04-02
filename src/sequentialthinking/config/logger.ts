/**
 * Logger module for Sequential Thinking MCP Server
 * 
 * This module provides a centralized logging system with different log levels,
 * formatting options, and output destinations.
 */

import * as fs from 'fs';
import * as path from 'path';
import { get } from './config.js';

// Log levels
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

// Log entry interface
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  requestId?: string;
}

/**
 * Logger class for centralized logging
 */
export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private logToFile: boolean;
  private logDir: string;
  private logFilePath: string;
  
  private constructor() {
    this.logLevel = this.parseLogLevel(get<string>('server.logLevel', 'info'));
    this.logToFile = get<boolean>('server.logToFile', false);
    this.logDir = get<string>('server.logDir', path.join(process.cwd(), 'logs'));
    
    // Create log directory if it doesn't exist
    if (this.logToFile && !fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    // Set log file path
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    this.logFilePath = path.join(this.logDir, `sequential-thinking-${timestamp}.log`);
  }
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }
  
  /**
   * Parse log level string to enum
   * @param level Log level string
   */
  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'debug':
        return LogLevel.DEBUG;
      case 'info':
        return LogLevel.INFO;
      case 'warn':
        return LogLevel.WARN;
      case 'error':
        return LogLevel.ERROR;
      default:
        return LogLevel.INFO;
    }
  }
  
  /**
   * Check if a log level should be logged
   * @param level Log level to check
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const configuredIndex = levels.indexOf(this.logLevel);
    const messageIndex = levels.indexOf(level);
    
    return messageIndex >= configuredIndex;
  }
  
  /**
   * Format a log entry
   * @param level Log level
   * @param message Log message
   * @param context Additional context
   * @param requestId Request ID for tracking
   */
  private formatLogEntry(level: LogLevel, message: string, context?: Record<string, any>, requestId?: string): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      requestId
    };
  }
  
  /**
   * Write a log entry to the console
   * @param entry Log entry to write
   */
  private writeToConsole(entry: LogEntry): void {
    const { timestamp, level, message, context, requestId } = entry;
    
    // Format the log message
    let logMessage = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (requestId) {
      logMessage += ` [${requestId}]`;
    }
    
    logMessage += `: ${message}`;
    
    // Add context if available
    if (context && Object.keys(context).length > 0) {
      logMessage += ` ${JSON.stringify(context)}`;
    }
    
    // Write to appropriate console method
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(logMessage);
        break;
      case LogLevel.INFO:
        console.info(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.ERROR:
        console.error(logMessage);
        break;
    }
  }
  
  /**
   * Write a log entry to a file
   * @param entry Log entry to write
   */
  private writeToFile(entry: LogEntry): void {
    if (!this.logToFile) {
      return;
    }
    
    try {
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.logFilePath, logLine);
    } catch (error) {
      console.error(`Failed to write to log file: ${error instanceof Error ? error.message : String(error)}`);
      // Disable file logging if it fails
      this.logToFile = false;
    }
  }
  
  /**
   * Log a message at the specified level
   * @param level Log level
   * @param message Log message
   * @param context Additional context
   * @param requestId Request ID for tracking
   */
  public log(level: LogLevel, message: string, context?: Record<string, any>, requestId?: string): void {
    if (!this.shouldLog(level)) {
      return;
    }
    
    const entry = this.formatLogEntry(level, message, context, requestId);
    
    // Write to console
    this.writeToConsole(entry);
    
    // Write to file if enabled
    this.writeToFile(entry);
  }
  
  /**
   * Log a debug message
   * @param message Log message
   * @param context Additional context
   * @param requestId Request ID for tracking
   */
  public debug(message: string, context?: Record<string, any>, requestId?: string): void {
    this.log(LogLevel.DEBUG, message, context, requestId);
  }
  
  /**
   * Log an info message
   * @param message Log message
   * @param context Additional context
   * @param requestId Request ID for tracking
   */
  public info(message: string, context?: Record<string, any>, requestId?: string): void {
    this.log(LogLevel.INFO, message, context, requestId);
  }
  
  /**
   * Log a warning message
   * @param message Log message
   * @param context Additional context
   * @param requestId Request ID for tracking
   */
  public warn(message: string, context?: Record<string, any>, requestId?: string): void {
    this.log(LogLevel.WARN, message, context, requestId);
  }
  
  /**
   * Log an error message
   * @param message Log message
   * @param context Additional context
   * @param requestId Request ID for tracking
   */
  public error(message: string, context?: Record<string, any>, requestId?: string): void {
    this.log(LogLevel.ERROR, message, context, requestId);
  }
  
  /**
   * Set the log level
   * @param level New log level
   */
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }
  
  /**
   * Enable or disable file logging
   * @param enable Whether to enable file logging
   * @param logDir Optional log directory
   */
  public setFileLogging(enable: boolean, logDir?: string): void {
    this.logToFile = enable;
    
    if (logDir) {
      this.logDir = logDir;
      
      // Create log directory if it doesn't exist
      if (this.logToFile && !fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      
      // Update log file path
      const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      this.logFilePath = path.join(this.logDir, `sequential-thinking-${timestamp}.log`);
    }
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Export convenience functions
export function debug(message: string, context?: Record<string, any>, requestId?: string): void {
  logger.debug(message, context, requestId);
}

export function info(message: string, context?: Record<string, any>, requestId?: string): void {
  logger.info(message, context, requestId);
}

export function warn(message: string, context?: Record<string, any>, requestId?: string): void {
  logger.warn(message, context, requestId);
}

export function error(message: string, context?: Record<string, any>, requestId?: string): void {
  logger.error(message, context, requestId);
}
