import type { z } from 'zod';
import { SequentialThinkingApp } from './container.js';
import { SequentialThinkingError, ValidationError, SecurityError, BusinessLogicError } from './errors.js';
import type { ThoughtData, Logger, ThoughtStorage, SecurityService, ThoughtFormatter, MetricsCollector, HealthChecker, HealthStatus, RequestMetrics, ThoughtMetrics, SystemMetrics, AppConfig, ThoughtTreeService, MCTSService, ThinkingMode, ThoughtTreeRecordResult } from './interfaces.js';
import { VALID_THINKING_MODES, thoughtDataSchema, getThoughtHistorySchema, setThinkingModeSchema, backtrackSchema, evaluateThoughtSchema, suggestNextThoughtSchema, getThinkingSummarySchema } from './interfaces.js';

export type ProcessThoughtRequest = ThoughtData;

export interface ProcessThoughtResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  statusCode?: number;
}

interface ServiceBundle {
  logger: Logger;
  storage: ThoughtStorage;
  security: SecurityService;
  formatter: ThoughtFormatter;
  metrics: MetricsCollector;
  config: AppConfig;
  thoughtTreeManager: ThoughtTreeService & MCTSService;
}

export class SequentialThinkingServer {
  private readonly app: SequentialThinkingApp;
  private _services: ServiceBundle | null = null;

  constructor() {
    this.app = new SequentialThinkingApp();
  }

  private get services(): ServiceBundle {
    if (!this._services) {
      const container = this.app.getContainer();
      this._services = {
        logger: container.get<Logger>('logger'),
        storage: container.get<ThoughtStorage>('storage'),
        security: container.get<SecurityService>('security'),
        formatter: container.get<ThoughtFormatter>('formatter'),
        metrics: container.get<MetricsCollector>('metrics'),
        config: container.get<AppConfig>('config'),
        thoughtTreeManager: container.get<ThoughtTreeService & MCTSService>('thoughtTreeManager'),
      };
    }
    return this._services;
  }

  private validateWithZod<T>(schema: z.ZodSchema<T>, data: unknown, errorContext: string): T {
    const result = schema.safeParse(data);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      throw new ValidationError(`${errorContext}: ${errors}`);
    }
    return result.data;
  }

  private validateInput(
    input: ProcessThoughtRequest,
  ): ProcessThoughtRequest {
    const validated = this.validateWithZod(thoughtDataSchema, input, 'Invalid thought input');
    this.validateBusinessLogic(validated);
    this.validateMaxLength(validated);
    return validated;
  }

  private validateMaxLength(input: ProcessThoughtRequest): void {
    const maxLength = this.services.config.state.maxThoughtLength;
    if (input.thought.length > maxLength) {
      throw new ValidationError(
        `Thought exceeds maximum length of ${maxLength} characters (actual: ${input.thought.length})`,
      );
    }
  }

  private validateBusinessLogic(input: ProcessThoughtRequest): void {
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

  private validateSessionId(sessionId: string): void {
    if (!sessionId) throw new ValidationError('sessionId is required');
    if (!this.services.security.validateSession(sessionId)) {
      throw new SecurityError('Invalid session ID format: must be 1-100 characters');
    }
  }

  private static safeStringify(value: unknown): string {
    const seen = new WeakSet();
    return JSON.stringify(value, (_key: string, val: unknown) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    }, 2);
  }

  private async withMetrics<T>(fn: () => T | Promise<T>): Promise<ProcessThoughtResponse> {
    const { metrics } = this.services;
    const startTime = Date.now();
    try {
      const result = await fn();
      metrics.recordRequest(Date.now() - startTime, true);
      return { content: [{ type: 'text', text: SequentialThinkingServer.safeStringify(result) }] };
    } catch (error) {
      metrics.recordRequest(Date.now() - startTime, false);
      throw error;
    }
  }

  private resolveSession(sessionId: string | undefined): string {
    // If user provided a sessionId, validate it first
    if (sessionId !== undefined) {
      if (!this.services.security.validateSession(sessionId)) {
        throw new SecurityError(
          `Invalid session ID format: must be 1-100 characters (got ${sessionId.length})`,
        );
      }
      return sessionId;
    }

    // No sessionId provided: generate a new one
    return this.services.security.generateSessionId();
  }

  private autoSetThinkingMode(
    input: ProcessThoughtRequest,
    thoughtData: ThoughtData,
    sessionId: string,
  ): void {
    const { thinkingMode: mode } = input;
    if (!mode || thoughtData.thoughtNumber !== 1) return;
    if ((VALID_THINKING_MODES as readonly string[]).includes(mode)) {
      this.services.thoughtTreeManager.setMode(
        sessionId, mode as ThinkingMode,
      );
    } else {
      this.services.logger.warn(
        `Invalid thinking mode "${mode}", ignoring. Valid: ${VALID_THINKING_MODES.join(', ')}`,
      );
    }
  }

  private enrichTreeResult(
    responseData: Record<string, unknown>,
    treeResult: ThoughtTreeRecordResult | null,
  ): void {
    if (!treeResult) return;
    responseData.nodeId = treeResult.nodeId;
    responseData.parentNodeId = treeResult.parentNodeId;
    responseData.treeStats = treeResult.treeStats;
    if (treeResult.modeGuidance) {
      responseData.modeGuidance = treeResult.modeGuidance;
    }
  }

  private enrichRevisionContext(
    responseData: Record<string, unknown>,
    thoughtData: ThoughtData,
    sessionId: string,
  ): void {
    if (!thoughtData.isRevision || !thoughtData.revisesThought) return;
    const { thoughtTreeManager, storage } = this.services;
    const treeNode = thoughtTreeManager.findNodeByThoughtNumber(
      sessionId, thoughtData.revisesThought,
    );
    if (treeNode) {
      responseData.revisionContext = {
        originalThought: treeNode.thought,
        originalThoughtNumber: treeNode.thoughtNumber,
      };
      return;
    }
    const history = storage.getHistory();
    const original = history.find(
      (t) =>
        t.thoughtNumber === thoughtData.revisesThought
        && t.sessionId === sessionId,
    );
    if (original) {
      responseData.revisionContext = {
        originalThought: original.thought,
        originalThoughtNumber: original.thoughtNumber,
      };
    }
  }

  private enrichBranchContext(
    responseData: Record<string, unknown>,
    thoughtData: ThoughtData,
  ): void {
    if (!thoughtData.branchId) return;
    const branchThoughts = this.services.storage.getBranchThoughts(
      thoughtData.branchId,
    );
    const prior = branchThoughts
      .filter(
        (t) =>
          t !== thoughtData
          && t.thoughtNumber !== thoughtData.thoughtNumber,
      )
      .map((t) => ({
        thoughtNumber: t.thoughtNumber, thought: t.thought,
      }));
    if (prior.length > 0) {
      responseData.branchContext = {
        branchId: thoughtData.branchId,
        existingThoughts: prior,
      };
    }
  }

  private recordToTree(
    thoughtData: ThoughtData,
    sessionId: string,
  ): ThoughtTreeRecordResult | null {
    const { thoughtTreeManager, logger } = this.services;
    try {
      return thoughtTreeManager.recordThought(thoughtData);
    } catch (treeError) {
      logger.warn(
        'Tree write failed after storage write succeeded',
        { error: treeError, sessionId },
      );
      return null;
    }
  }

  private logThought(
    sessionId: string,
    thoughtData: ThoughtData,
  ): void {
    const { config, logger, formatter } = this.services;
    if (!config.logging.enableThoughtLogging) return;
    logger.logThought(sessionId, thoughtData);
    try {
      console.error(formatter.format(thoughtData));
    } catch {
      console.error(
        `[Thought] ${thoughtData.thoughtNumber}/${thoughtData.totalThoughts}`,
      );
    }
  }

  private async processWithServices(
    input: ProcessThoughtRequest,
  ): Promise<ProcessThoughtResponse> {
    const { storage, security, metrics } = this.services;
    const startTime = Date.now();

    try {
      const sessionId = this.resolveSession(input.sessionId);
      security.validateThought(input.thought, sessionId);
      const sanitized = security.sanitizeContent(input.thought);
      const thoughtData = this.buildThoughtData(
        input, sanitized, sessionId,
      );

      this.autoSetThinkingMode(input, thoughtData, sessionId);
      storage.addThought(thoughtData);
      const treeResult = this.recordToTree(thoughtData, sessionId);

      const responseData: Record<string, unknown> = {
        thoughtNumber: thoughtData.thoughtNumber,
        totalThoughts: thoughtData.totalThoughts,
        nextThoughtNeeded: thoughtData.nextThoughtNeeded,
        branches: storage.getBranches(),
        thoughtHistoryLength: storage.getStats().historySize,
        sessionId,
        timestamp: thoughtData.timestamp,
      };

      this.enrichTreeResult(responseData, treeResult);
      if (!treeResult) {
        responseData.warning = 'Tree recording failed; MCTS features unavailable for this thought';
      }
      this.enrichRevisionContext(responseData, thoughtData, sessionId);
      this.enrichBranchContext(responseData, thoughtData);
      this.logThought(sessionId, thoughtData);

      const duration = Date.now() - startTime;
      metrics.recordRequest(duration, true);
      metrics.recordThoughtProcessed(thoughtData);
      return {
        content: [{
          type: 'text' as const,
          text: SequentialThinkingServer.safeStringify(responseData),
        }],
      };
    } catch (error) {
      metrics.recordRequest(Date.now() - startTime, false);
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
      return this.handleError(error as Error);
    }
  }

  // Health check method
  public async getHealthStatus(): Promise<HealthStatus> {
    try {
      return await this.app.getContainer().get<HealthChecker>('healthChecker').checkHealth();
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
    return this.services.metrics.getMetrics();
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

  private handleError(error: Error): ProcessThoughtResponse {
    if (error instanceof SequentialThinkingError) {
      return {
        content: [{ type: 'text', text: JSON.stringify(error.toJSON(), null, 2) }],
        isError: true,
        statusCode: error.statusCode,
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        category: 'SYSTEM',
        statusCode: 500,
        timestamp: new Date().toISOString(),
      }, null, 2) }],
      isError: true,
      statusCode: 500,
    };
  }

  // MCTS tree operations
  public async backtrack(sessionId: string, nodeId: string): Promise<ProcessThoughtResponse> {
    try {
      this.validateSessionId(sessionId);
      const validated = this.validateWithZod(backtrackSchema, { sessionId, nodeId }, 'Invalid backtrack input');
      return await this.withMetrics(() => {
        return this.services.thoughtTreeManager.backtrack(validated.sessionId, validated.nodeId);
      });
    } catch (error) {
      return this.handleError(error as Error);
    }
  }

  public async evaluateThought(
    sessionId: string,
    nodeId: string,
    value: number,
  ): Promise<ProcessThoughtResponse> {
    try {
      this.validateSessionId(sessionId);
      const validated = this.validateWithZod(evaluateThoughtSchema, { sessionId, nodeId, value }, 'Invalid evaluate thought input');
      return await this.withMetrics(() => {
        return this.services.thoughtTreeManager.evaluate(
          validated.sessionId,
          validated.nodeId,
          validated.value,
        );
      });
    } catch (error) {
      return this.handleError(error as Error);
    }
  }

  public async suggestNextThought(
    sessionId: string,
    strategy?: 'explore' | 'exploit' | 'balanced',
  ): Promise<ProcessThoughtResponse> {
    try {
      this.validateSessionId(sessionId);
      const validated = this.validateWithZod(suggestNextThoughtSchema, { sessionId, strategy }, 'Invalid suggest next thought input');
      return await this.withMetrics(() => {
        return this.services.thoughtTreeManager.suggest(validated.sessionId, validated.strategy);
      });
    } catch (error) {
      return this.handleError(error as Error);
    }
  }

  public async getThinkingSummary(
    sessionId: string,
    maxDepth?: number,
  ): Promise<ProcessThoughtResponse> {
    try {
      this.validateSessionId(sessionId);
      const validated = this.validateWithZod(getThinkingSummarySchema, { sessionId, maxDepth }, 'Invalid get thinking summary input');
      return await this.withMetrics(() => {
        return this.services.thoughtTreeManager.getSummary(validated.sessionId, validated.maxDepth);
      });
    } catch (error) {
      return this.handleError(error as Error);
    }
  }

  // Set thinking mode for a session
  public async setThinkingMode(sessionId: string, mode: string): Promise<ProcessThoughtResponse> {
    try {
      this.validateSessionId(sessionId);
      const validated = this.validateWithZod(setThinkingModeSchema, { sessionId, mode }, 'Invalid set thinking mode input');
      return await this.withMetrics(() => {
        const config = this.services.thoughtTreeManager.setMode(
          validated.sessionId,
          validated.mode,
        );
        return {
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
        };
      });
    } catch (error) {
      return this.handleError(error as Error);
    }
  }

  // Filtered history for the get_thought_history tool
  public getFilteredHistory(options: {
    sessionId: string;
    branchId?: string;
    limit?: number;
  }): ThoughtData[] {
    try {
      const validated = this.validateWithZod(getThoughtHistorySchema, options, 'Invalid get thought history input');
      const { storage } = this.services;
      const source = validated.branchId
        ? storage.getBranchThoughts(validated.branchId)
        : storage.getHistory();
      const filtered = source.filter((t) => t.sessionId === validated.sessionId);
      return validated.limit ? filtered.slice(-validated.limit) : filtered;
    } catch (error) {
      console.error('Warning: failed to get filtered history:', error);
      return [];
    }
  }

  // Legacy compatibility methods
  public getThoughtHistory(limit?: number): ThoughtData[] {
    try {
      return this.services.storage.getHistory(limit);
    } catch (error) {
      console.error('Warning: failed to get thought history:', error);
      return [];
    }
  }

  public getBranches(): string[] {
    try {
      return this.services.storage.getBranches();
    } catch (error) {
      console.error('Warning: failed to get branches:', error);
      return [];
    }
  }
}
