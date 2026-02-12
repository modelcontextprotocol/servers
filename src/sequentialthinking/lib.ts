import type { ThoughtData } from './circular-buffer.js';
import { SequentialThinkingApp } from './container.js';
import { CompositeErrorHandler } from './error-handlers.js';
import { ValidationError, SecurityError, BusinessLogicError } from './errors.js';
import type { Logger, ThoughtStorage, SecurityService, ThoughtFormatter, MetricsCollector, HealthChecker, HealthStatus, RequestMetrics, ThoughtMetrics, SystemMetrics, AppConfig } from './interfaces.js';

export type ProcessThoughtRequest = ThoughtData;

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

  private validateInput(
    input: ProcessThoughtRequest,
  ): void {
    const config = this.app.getContainer().get<AppConfig>('config');
    this.validateStructure(input, config.state.maxThoughtLength);
    this.validateBusinessLogic(input);
  }

  private static isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && value >= 1 && Number.isInteger(value);
  }

  private validateStructure(input: ProcessThoughtRequest, maxThoughtLength: number): void {
    if (!input.thought || typeof input.thought !== 'string' || input.thought.trim().length === 0) {
      throw new ValidationError(
        'Thought is required and must be a non-empty string',
      );
    }
    // Unified length validation - single source of truth
    if (input.thought.length > maxThoughtLength) {
      throw new ValidationError(
        `Thought exceeds maximum length of ${maxThoughtLength} characters (actual: ${input.thought.length})`,
      );
    }
    if (!SequentialThinkingServer.isPositiveInteger(input.thoughtNumber)) {
      throw new ValidationError(
        'thoughtNumber must be a positive integer',
      );
    }
    if (!SequentialThinkingServer.isPositiveInteger(input.totalThoughts)) {
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
      config: AppConfig;
      } {
    const container = this.app.getContainer();
    return {
      logger: container.get<Logger>('logger'),
      storage: container.get<ThoughtStorage>('storage'),
      security: container.get<SecurityService>('security'),
      formatter: container.get<ThoughtFormatter>('formatter'),
      metrics: container.get<MetricsCollector>('metrics'),
      config: container.get<AppConfig>('config'),
    };
  }

  private resolveSession(
    sessionId: string | undefined,
    security: SecurityService,
  ): string {
    // If user provided a sessionId, validate it first
    if (sessionId !== undefined && sessionId !== null) {
      if (!security.validateSession(sessionId)) {
        throw new SecurityError(
          `Invalid session ID format: must be 1-100 characters (got ${sessionId.length})`,
        );
      }
      return sessionId;
    }

    // No sessionId provided: generate a new one
    const generated = security.generateSessionId();
    if (!security.validateSession(generated)) {
      throw new SecurityError('Failed to generate valid session ID');
    }
    return generated;
  }

  private async processWithServices(
    input: ProcessThoughtRequest,
  ): Promise<ProcessThoughtResponse> {
    const { logger, storage, security, formatter, metrics, config } =
      this.getServices();
    const startTime = Date.now();

    try {
      const sessionId = this.resolveSession(
        input.sessionId, security,
      );
      // Sanitize content first to remove harmful patterns
      const sanitized = security.sanitizeContent(input.thought);
      // Then validate the sanitized content (checks rate limiting, blocked patterns on clean text)
      security.validateThought(sanitized, sessionId);
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

      if (config.logging.enableThoughtLogging) {
        logger.logThought(sessionId, thoughtData);
        try {
          console.error(formatter.format(thoughtData));
        } catch {
          console.error(`[Thought] ${thoughtData.thoughtNumber}/${thoughtData.totalThoughts}`);
        }
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
      this.validateInput(input);

      // Process with services
      return await this.processWithServices(input);

    } catch (error) {
      // Handle errors using composite error handler
      return this.errorHandler.handle(error as Error);
    }
  }

  // Health check method
  public async getHealthStatus(): Promise<HealthStatus> {
    try {
      const container = this.app.getContainer();
      const healthChecker = container.get<HealthChecker>('healthChecker');
      return await healthChecker.checkHealth();
    } catch (error) {
      return {
        status: 'unhealthy',
        summary: 'Health check failed',
        checks: {
          memory: { status: 'unhealthy', message: 'Health check failed', responseTime: 0, timestamp: new Date() },
          responseTime: { status: 'unhealthy', message: 'Health check failed', responseTime: 0, timestamp: new Date() },
          errorRate: { status: 'unhealthy', message: 'Health check failed', responseTime: 0, timestamp: new Date() },
          storage: { status: 'unhealthy', message: 'Health check failed', responseTime: 0, timestamp: new Date() },
          security: { status: 'unhealthy', message: 'Health check failed', responseTime: 0, timestamp: new Date() },
        },
        uptime: process.uptime(),
        timestamp: new Date(),
      };
    }
  }

  // Metrics method
  public getMetrics(): {
      requests: RequestMetrics;
      thoughts: ThoughtMetrics;
      system: SystemMetrics;
      } {
    const container = this.app.getContainer();
    const metrics = container.get<MetricsCollector>('metrics');
    return metrics.getMetrics();
  }

  // Cleanup method (idempotent — safe to call multiple times)
  private destroyed = false;

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    try {
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
      console.error('Warning: failed to get thought history:', error);
      return [];
    }
  }

  public getBranches(): string[] {
    try {
      const container = this.app.getContainer();
      const storage = container.get<ThoughtStorage>('storage');
      return storage.getBranches();
    } catch (error) {
      console.error('Warning: failed to get branches:', error);
      return [];
    }
  }
}
