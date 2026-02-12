import type { ThoughtData } from './circular-buffer.js';
import { SequentialThinkingApp } from './container.js';
import { CompositeErrorHandler } from './error-handlers.js';
import { ValidationError, SecurityError, BusinessLogicError, TreeError } from './errors.js';
import type { Logger, ThoughtStorage, SecurityService, ThoughtFormatter, MetricsCollector, HealthChecker, HealthStatus, RequestMetrics, ThoughtMetrics, SystemMetrics, AppConfig, ThoughtTreeService, MCTSService, ThinkingMode } from './interfaces.js';

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
      thoughtTreeManager: ThoughtTreeService & MCTSService;
      } {
    const container = this.app.getContainer();
    return {
      logger: container.get<Logger>('logger'),
      storage: container.get<ThoughtStorage>('storage'),
      security: container.get<SecurityService>('security'),
      formatter: container.get<ThoughtFormatter>('formatter'),
      metrics: container.get<MetricsCollector>('metrics'),
      config: container.get<AppConfig>('config'),
      thoughtTreeManager: container.get<ThoughtTreeService & MCTSService>('thoughtTreeManager'),
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
    const { logger, storage, security, formatter, metrics, config, thoughtTreeManager } =
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

      // Auto-set thinking mode if provided on input
      const thinkingMode = (input as unknown as Record<string, unknown>).thinkingMode as string | undefined;
      if (thinkingMode && thoughtData.thoughtNumber === 1) {
        const validModes = ['fast', 'expert', 'deep'];
        if (validModes.includes(thinkingMode)) {
          thoughtTreeManager.setMode(sessionId, thinkingMode as ThinkingMode);
        }
      }

      storage.addThought(thoughtData);
      const treeResult = thoughtTreeManager.recordThought(thoughtData);
      const stats = storage.getStats();

      const responseData: Record<string, unknown> = {
        thoughtNumber: thoughtData.thoughtNumber,
        totalThoughts: thoughtData.totalThoughts,
        nextThoughtNeeded: thoughtData.nextThoughtNeeded,
        branches: storage.getBranches(),
        thoughtHistoryLength: stats.historySize,
        sessionId,
        timestamp: thoughtData.timestamp,
      };

      if (treeResult) {
        responseData.nodeId = treeResult.nodeId;
        responseData.parentNodeId = treeResult.parentNodeId;
        responseData.treeStats = treeResult.treeStats;
        if (treeResult.modeGuidance) {
          responseData.modeGuidance = treeResult.modeGuidance;
        }
      }

      // Enrich with revision context when applicable
      if (thoughtData.isRevision && thoughtData.revisesThought) {
        const history = storage.getHistory();
        const original = history.find(
          (t) => t.thoughtNumber === thoughtData.revisesThought && t.sessionId === sessionId,
        );
        if (original) {
          responseData.revisionContext = {
            originalThought: original.thought,
            originalThoughtNumber: original.thoughtNumber,
          };
        }
      }

      // Enrich with branch context when applicable
      if (thoughtData.branchId) {
        const branchThoughts = storage.getBranchThoughts(thoughtData.branchId);
        // Exclude the thought we just added to show only prior context
        const prior = branchThoughts
          .filter((t) => t !== thoughtData && t.thoughtNumber !== thoughtData.thoughtNumber)
          .map((t) => ({ thoughtNumber: t.thoughtNumber, thought: t.thought }));
        if (prior.length > 0) {
          responseData.branchContext = {
            branchId: thoughtData.branchId,
            existingThoughts: prior,
          };
        }
      }

      const response = {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(responseData, null, 2),
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

  // MCTS tree operations
  public async backtrack(sessionId: string, nodeId: string): Promise<ProcessThoughtResponse> {
    try {
      const { thoughtTreeManager } = this.getServices();
      const result = thoughtTreeManager.backtrack(sessionId, nodeId);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return this.errorHandler.handle(error as Error);
    }
  }

  public async evaluateThought(sessionId: string, nodeId: string, value: number): Promise<ProcessThoughtResponse> {
    try {
      if (value < 0 || value > 1) {
        throw new ValidationError('value must be between 0 and 1');
      }
      const { thoughtTreeManager } = this.getServices();
      const result = thoughtTreeManager.evaluate(sessionId, nodeId, value);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return this.errorHandler.handle(error as Error);
    }
  }

  public async suggestNextThought(sessionId: string, strategy?: 'explore' | 'exploit' | 'balanced'): Promise<ProcessThoughtResponse> {
    try {
      const { thoughtTreeManager } = this.getServices();
      const result = thoughtTreeManager.suggest(sessionId, strategy);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return this.errorHandler.handle(error as Error);
    }
  }

  public async getThinkingSummary(sessionId: string, maxDepth?: number): Promise<ProcessThoughtResponse> {
    try {
      const { thoughtTreeManager } = this.getServices();
      const result = thoughtTreeManager.getSummary(sessionId, maxDepth);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return this.errorHandler.handle(error as Error);
    }
  }

  // Set thinking mode for a session
  public async setThinkingMode(sessionId: string, mode: string): Promise<ProcessThoughtResponse> {
    try {
      const validModes = ['fast', 'expert', 'deep'];
      if (!validModes.includes(mode)) {
        throw new ValidationError(`Invalid thinking mode: "${mode}". Must be one of: ${validModes.join(', ')}`);
      }
      const { thoughtTreeManager } = this.getServices();
      const config = thoughtTreeManager.setMode(sessionId, mode as ThinkingMode);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          sessionId,
          mode: config.mode,
          config: {
            explorationConstant: config.explorationConstant,
            suggestStrategy: config.suggestStrategy,
            maxBranchingFactor: config.maxBranchingFactor,
            targetDepth: `${config.targetDepthMin}-${config.targetDepthMax}`,
            autoEvaluate: config.autoEvaluate,
            enableBacktracking: config.enableBacktracking,
            convergenceThreshold: config.convergenceThreshold,
          },
        }, null, 2) }],
      };
    } catch (error) {
      return this.errorHandler.handle(error as Error);
    }
  }

  // Filtered history for the get_thought_history tool
  public getFilteredHistory(options: {
    sessionId: string;
    branchId?: string;
    limit?: number;
  }): ThoughtData[] {
    try {
      const container = this.app.getContainer();
      const storage = container.get<ThoughtStorage>('storage');

      if (options.branchId) {
        const branchThoughts = storage.getBranchThoughts(options.branchId);
        const filtered = branchThoughts.filter((t) => t.sessionId === options.sessionId);
        if (options.limit && options.limit > 0) {
          return filtered.slice(-options.limit);
        }
        return filtered;
      }

      const history = storage.getHistory();
      const filtered = history.filter((t) => t.sessionId === options.sessionId);
      if (options.limit && options.limit > 0) {
        return filtered.slice(-options.limit);
      }
      return filtered;
    } catch (error) {
      console.error('Warning: failed to get filtered history:', error);
      return [];
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
