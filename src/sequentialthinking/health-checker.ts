import type {
  HealthChecker,
  MetricsCollector,
  ThoughtStorage,
  SecurityService,
} from './interfaces.js';
import { z } from 'zod';

export const HealthCheckResultSchema = z.object({
  status: z.enum(['healthy', 'unhealthy', 'degraded']),
  message: z.string(),
  details: z.unknown().optional(),
  responseTime: z.number(),
  timestamp: z.date(),
});

export const HealthStatusSchema = z.object({
  status: z.enum(['healthy', 'unhealthy', 'degraded']),
  checks: z.object({
    memory: HealthCheckResultSchema,
    responseTime: HealthCheckResultSchema,
    errorRate: HealthCheckResultSchema,
    storage: HealthCheckResultSchema,
    security: HealthCheckResultSchema,
  }),
  summary: z.string(),
  uptime: z.number(),
  timestamp: z.date(),
});

export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>;
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

interface RequestMetricsData {
  averageResponseTime: number;
  totalRequests: number;
  failedRequests: number;
}

interface MetricsData {
  requests: RequestMetricsData;
}

const FALLBACK_CHECK: HealthCheckResult = {
  status: 'unhealthy',
  message: 'Check failed',
  responseTime: 0,
  timestamp: new Date(),
};

function unwrapSettled(
  result: PromiseSettledResult<HealthCheckResult>,
): HealthCheckResult {
  if (result.status === 'fulfilled') {
    return result.value;
  }
  return { ...FALLBACK_CHECK, timestamp: new Date() };
}

export class ComprehensiveHealthChecker implements HealthChecker {
  private readonly maxMemoryUsage = 90;
  private readonly maxStorageUsage = 80;
  private readonly maxResponseTime = 200;

  constructor(
    private readonly metrics: MetricsCollector,
    private readonly storage: ThoughtStorage,
    private readonly security: SecurityService,
  ) {}

  async checkHealth(): Promise<HealthStatus> {
    try {
      const settled = await Promise.allSettled([
        this.checkMemory(),
        this.checkResponseTime(),
        this.checkErrorRate(),
        this.checkStorage(),
        this.checkSecurity(),
      ]);

      const [
        memoryResult,
        responseTimeResult,
        errorRateResult,
        storageResult,
        securityResult,
      ] = settled.map(unwrapSettled);

      const statuses = [
        memoryResult,
        responseTimeResult,
        errorRateResult,
        storageResult,
        securityResult,
      ].map((r) => r.status);

      const hasUnhealthy = statuses.includes('unhealthy');
      const hasDegraded = statuses.includes('degraded');

      const result = {
        status: hasUnhealthy
          ? ('unhealthy' as const)
          : hasDegraded
            ? ('degraded' as const)
            : ('healthy' as const),
        checks: {
          memory: memoryResult,
          responseTime: responseTimeResult,
          errorRate: errorRateResult,
          storage: storageResult,
          security: securityResult,
        },
        summary: `Health check completed at ${new Date().toISOString()}`,
        uptime: process.uptime(),
        timestamp: new Date(),
      };

      const validationResult = HealthStatusSchema.safeParse(result);
      if (!validationResult.success) {
        return {
          status: 'unhealthy',
          checks: {
            memory: memoryResult,
            responseTime: responseTimeResult,
            errorRate: errorRateResult,
            storage: storageResult,
            security: securityResult,
          },
          summary: `Validation failed: ${validationResult.error.message}`,
          uptime: process.uptime(),
          timestamp: new Date(),
        };
      }

      return validationResult.data;
    } catch {
      const fallback = { ...FALLBACK_CHECK, timestamp: new Date() };
      return {
        status: 'unhealthy',
        checks: {
          memory: fallback,
          responseTime: { ...fallback },
          errorRate: { ...fallback },
          storage: { ...fallback },
          security: { ...fallback },
        },
        summary: 'Health check failed',
        uptime: process.uptime(),
        timestamp: new Date(),
      };
    }
  }

  private makeResult(
    status: 'healthy' | 'unhealthy' | 'degraded',
    message: string,
    startTime: number,
    details?: unknown,
  ): HealthCheckResult {
    return {
      status,
      message,
      details,
      responseTime: Date.now() - startTime,
      timestamp: new Date(),
    };
  }

  private async checkMemory(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const memoryUsage = process.memoryUsage();
      const heapUsedPercent =
        (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

      const memoryData = {
        heapUsed: Math.round(heapUsedPercent),
        heapTotal: Math.round(memoryUsage.heapTotal),
        external: Math.round(memoryUsage.external),
        rss: Math.round(memoryUsage.rss),
      };

      if (heapUsedPercent > this.maxMemoryUsage) {
        return this.makeResult(
          'unhealthy',
          `Memory usage too high: ${heapUsedPercent.toFixed(1)}%`,
          startTime,
          memoryData,
        );
      } else if (heapUsedPercent > this.maxMemoryUsage * 0.8) {
        return this.makeResult(
          'degraded',
          `Memory usage elevated: ${heapUsedPercent.toFixed(1)}%`,
          startTime,
          memoryData,
        );
      }
      return this.makeResult(
        'healthy',
        `Memory usage normal: ${heapUsedPercent.toFixed(1)}%`,
        startTime,
        memoryData,
      );
    } catch {
      return this.makeResult('unhealthy', 'Memory check failed', startTime);
    }
  }

  private async checkResponseTime(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const metricsData = this.metrics.getMetrics() as unknown as MetricsData;
      const avgResponseTime =
        metricsData.requests.averageResponseTime;

      const responseTimeData = {
        avgResponseTime: Math.round(avgResponseTime),
        requestCount: metricsData.requests.totalRequests,
      };

      if (avgResponseTime > this.maxResponseTime) {
        return this.makeResult(
          'degraded',
          `Response time elevated: ${avgResponseTime.toFixed(0)}ms`,
          startTime,
          responseTimeData,
        );
      } else if (avgResponseTime > this.maxResponseTime * 0.6) {
        return this.makeResult(
          'degraded',
          `Response time slightly elevated: ${avgResponseTime.toFixed(0)}ms`,
          startTime,
          responseTimeData,
        );
      }
      return this.makeResult(
        'healthy',
        `Response time normal: ${avgResponseTime.toFixed(0)}ms`,
        startTime,
        responseTimeData,
      );
    } catch {
      return this.makeResult(
        'unhealthy',
        'Response time check failed',
        startTime,
      );
    }
  }

  private async checkErrorRate(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const metricsData = this.metrics.getMetrics() as unknown as MetricsData;
      const { totalRequests, failedRequests } = metricsData.requests;

      const errorRate =
        totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;

      if (errorRate > 5) {
        return this.makeResult(
          'unhealthy',
          `Error rate: ${errorRate.toFixed(1)}%`,
          startTime,
          { totalRequests, failedRequests, errorRate },
        );
      } else if (errorRate > 2) {
        return this.makeResult(
          'degraded',
          `Error rate: ${errorRate.toFixed(1)}%`,
          startTime,
          { totalRequests, failedRequests, errorRate },
        );
      }
      return this.makeResult(
        'healthy',
        `Error rate: ${errorRate.toFixed(1)}%`,
        startTime,
        { totalRequests, failedRequests, errorRate },
      );
    } catch {
      return this.makeResult(
        'unhealthy',
        'Error rate check failed',
        startTime,
      );
    }
  }

  private async checkStorage(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const stats = this.storage.getStats();
      const usagePercent =
        (stats.historySize / stats.historyCapacity) * 100;

      const storageData = {
        historySize: stats.historySize,
        historyCapacity: stats.historyCapacity,
        usagePercent: Math.round(usagePercent),
      };

      if (usagePercent > this.maxStorageUsage) {
        return this.makeResult(
          'degraded',
          `Storage usage elevated: ${usagePercent.toFixed(1)}%`,
          startTime,
          storageData,
        );
      } else if (usagePercent > this.maxStorageUsage * 0.8) {
        return this.makeResult(
          'degraded',
          `Storage usage slightly elevated: ${usagePercent.toFixed(1)}%`,
          startTime,
          storageData,
        );
      }
      return this.makeResult(
        'healthy',
        `Storage usage normal: ${usagePercent.toFixed(1)}%`,
        startTime,
        storageData,
      );
    } catch {
      return this.makeResult(
        'unhealthy',
        'Storage check failed',
        startTime,
      );
    }
  }

  private async checkSecurity(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const securityStatus = this.security.getSecurityStatus();

      return this.makeResult(
        'healthy',
        'Security systems operational',
        startTime,
        securityStatus,
      );
    } catch {
      return this.makeResult(
        'unhealthy',
        'Security check failed',
        startTime,
      );
    }
  }
}
