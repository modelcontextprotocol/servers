import type { ThoughtData } from './circular-buffer.js';
import { SequentialThinkingApp } from './container.js';
import { CompositeErrorHandler } from './error-handlers.js';
import { ValidationError, SecurityError, BusinessLogicError } from './errors.js';
import type { Logger, ThoughtStorage, SecurityService, ThoughtFormatter, MetricsCollector, HealthChecker } from './interfaces.js';

export interface ProcessThoughtRequest extends ThoughtData {
  sessionId?: string;
  origin?: string;
  ipAddress?: string;
}

export interface ProcessThoughtResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  statusCode?: number;
}

export class SequentialThinkingServer {
  private readonly app: SequentialThinkingApp;
  private readonly errorHandler: CompositeErrorHandler;
  
  constructor() {
    this.app = new SequentialThinkingApp();
    this.errorHandler = new CompositeErrorHandler();
  }

  private async validateInput(
    input: ProcessThoughtRequest,
  ): Promise<void> {
    this.validateStructure(input);
    this.validateBusinessLogic(input);
  }

  private validateStructure(input: ProcessThoughtRequest): void {
    if (!input.thought || typeof input.thought !== 'string') {
      throw new ValidationError(
        'Thought is required and must be a string',
      );
    }
    if (typeof input.thoughtNumber !== 'number'
      || input.thoughtNumber < 1) {
      throw new ValidationError(
        'thoughtNumber must be a positive integer',
      );
    }
    if (typeof input.totalThoughts !== 'number'
      || input.totalThoughts < 1) {
      throw new ValidationError(
        'totalThoughts must be a positive integer',
      );
    }
    if (typeof input.nextThoughtNeeded !== 'boolean') {
      throw new ValidationError(
        'nextThoughtNeeded must be a boolean',
      );
    }
  }

  private validateBusinessLogic(
    input: ProcessThoughtRequest,
  ): void {
    if (input.isRevision && !input.revisesThought) {
      throw new BusinessLogicError(
        'isRevision requires revisesThought to be specified',
      );
    }
    if (input.branchFromThought && !input.branchId) {
      throw new BusinessLogicError(
        'branchFromThought requires branchId to be specified',
      );
    }
  }

  private buildThoughtData(
    input: ProcessThoughtRequest,
    sanitizedThought: string,
    sessionId: string,
  ): ThoughtData {
    const thoughtData: ThoughtData = {
      ...input,
      thought: sanitizedThought,
      sessionId,
      timestamp: Date.now(),
    };
    if (thoughtData.thoughtNumber > thoughtData.totalThoughts) {
      thoughtData.totalThoughts = thoughtData.thoughtNumber;
    }
    return thoughtData;
  }

  private getServices(): {
      logger: Logger;
      storage: ThoughtStorage;
      security: SecurityService;
      formatter: ThoughtFormatter;
      metrics: MetricsCollector;
      } {
    const container = this.app.getContainer();
    return {
      logger: container.get<Logger>('logger'),
      storage: container.get<ThoughtStorage>('storage'),
      security: container.get<SecurityService>('security'),
      formatter: container.get<ThoughtFormatter>('formatter'),
      metrics: container.get<MetricsCollector>('metrics'),
    };
  }

  private resolveSession(
    sessionId: string | undefined,
    security: SecurityService,
  ): string {
    const resolved = sessionId ?? security.generateSessionId();
    if (!security.validateSession(resolved)) {
      throw new SecurityError('Invalid session ID');
    }
    return resolved;
  }

  private async processWithServices(
    input: ProcessThoughtRequest,
  ): Promise<ProcessThoughtResponse> {
    const { logger, storage, security, formatter, metrics } =
      this.getServices();
    const startTime = Date.now();

    try {
      const sessionId = this.resolveSession(
        input.sessionId, security,
      );
      security.validateThought(
        input.thought, sessionId, input.origin, input.ipAddress,
      );
      const sanitized = security.sanitizeContent(input.thought);
      const thoughtData = this.buildThoughtData(
        input, sanitized, sessionId,
      );

      storage.addThought(thoughtData);
      const stats = storage.getStats();

      const response = {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            thoughtNumber: thoughtData.thoughtNumber,
            totalThoughts: thoughtData.totalThoughts,
            nextThoughtNeeded: thoughtData.nextThoughtNeeded,
            branches: storage.getBranches(),
            thoughtHistoryLength: stats.historySize,
            sessionId,
            timestamp: thoughtData.timestamp,
          }, null, 2),
        }],
      };

      if (process.env.DISABLE_THOUGHT_LOGGING !== 'true') {
        logger.logThought(sessionId, thoughtData);
        console.error(formatter.format(thoughtData));
      }

      const duration = Date.now() - startTime;
      metrics.recordRequest(duration, true);
      metrics.recordThoughtProcessed(thoughtData);
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      metrics.recordRequest(duration, false);
      metrics.recordError(error as Error);
      throw error;
    }
  }

  public async processThought(input: ProcessThoughtRequest): Promise<ProcessThoughtResponse> {
    try {
      // Validate input first
      await this.validateInput(input);
      
      // Process with services
      return await this.processWithServices(input);
      
    } catch (error) {
      // Handle errors using composite error handler
      return this.errorHandler.handle(error as Error);
    }
  }

  // Health check method
  public async getHealthStatus(): Promise<Record<string, unknown>> {
    try {
      const container = this.app.getContainer();
      const healthChecker = container.get<HealthChecker>('healthChecker');
      return await healthChecker.checkHealth();
    } catch (error) {
      return {
        status: 'unhealthy',
        summary: 'Health check failed',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      };
    }
  }

  // Metrics method
  public getMetrics(): Record<string, unknown> {
    try {
      const container = this.app.getContainer();
      const metrics = container.get<MetricsCollector>('metrics');
      return metrics.getMetrics();
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      };
    }
  }

  // Cleanup method
  public destroy(): void {
    try {
      const container = this.app.getContainer();
      const storage = container.get<ThoughtStorage>('storage');
      
      if (storage && typeof storage.destroy === 'function') {
        storage.destroy();
      }
      
      this.app.destroy();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  // Legacy compatibility methods
  public getThoughtHistory(limit?: number): ThoughtData[] {
    try {
      const container = this.app.getContainer();
      const storage = container.get<ThoughtStorage>('storage');
      return storage.getHistory(limit);
    } catch (error) {
      return [];
    }
  }

  public getBranches(): string[] {
    try {
      const container = this.app.getContainer();
      const storage = container.get<ThoughtStorage>('storage');
      return storage.getBranches();
    } catch (error) {
      return [];
    }
  }
}
