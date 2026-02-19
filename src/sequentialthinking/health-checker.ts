import type {
  AppConfig,
  HealthChecker,
  HealthCheckResult,
  HealthStatus,
  MetricsCollector,
  ThoughtStorage,
  SecurityService,
} from './interfaces.js';

function createFallbackCheck(): HealthCheckResult {
  return {
    status: 'unhealthy',
    message: 'Check failed',
    responseTime: 0,
    timestamp: new Date(),
  };
}

function unwrapSettled(
  result: PromiseSettledResult<HealthCheckResult>,
): HealthCheckResult {
  if (result.status === 'fulfilled') {
    return result.value;
  }
  return createFallbackCheck();
}

export class ComprehensiveHealthChecker implements HealthChecker {
  private readonly maxMemoryUsage: number;
  private readonly maxStorageUsage: number;
  private readonly maxResponseTime: number;
  private readonly errorRateDegraded: number;
  private readonly errorRateUnhealthy: number;

  constructor(
    private readonly metrics: MetricsCollector,
    private readonly storage: ThoughtStorage,
    private readonly security: SecurityService,
    thresholds?: AppConfig['monitoring']['healthThresholds'],
  ) {
    this.maxMemoryUsage = thresholds?.maxMemoryPercent ?? 90;
    this.maxStorageUsage = thresholds?.maxStoragePercent ?? 80;
    this.maxResponseTime = thresholds?.maxResponseTimeMs ?? 200;
    this.errorRateDegraded = thresholds?.errorRateDegraded ?? 2;
    this.errorRateUnhealthy = thresholds?.errorRateUnhealthy ?? 5;
  }

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

      return {
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
    } catch {
      const fallback = createFallbackCheck();
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

  private evaluateMetric(opts: {
    label: string;
    value: number;
    threshold: number;
    degradedThreshold: number;
    startTime: number;
    details: unknown;
  }): HealthCheckResult {
    const { label, value, threshold, degradedThreshold } = opts;
    const { startTime, details } = opts;
    const formatted = `${value.toFixed(1)}%`;
    if (value > threshold) {
      return this.makeResult(
        'unhealthy', `${label} too high: ${formatted}`,
        startTime, details,
      );
    }
    if (value > degradedThreshold) {
      return this.makeResult(
        'degraded', `${label} elevated: ${formatted}`,
        startTime, details,
      );
    }
    return this.makeResult(
      'healthy', `${label} normal: ${formatted}`,
      startTime, details,
    );
  }

  private async checkMemory(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const mem = process.memoryUsage();
      const heapUsedPercent = (mem.heapUsed / mem.heapTotal) * 100;
      const details = {
        heapUsed: Math.round(heapUsedPercent),
        heapTotal: Math.round(mem.heapTotal),
        external: Math.round(mem.external),
        rss: Math.round(mem.rss),
      };
      return this.evaluateMetric({
        label: 'Memory usage',
        value: heapUsedPercent,
        threshold: this.maxMemoryUsage,
        degradedThreshold: this.maxMemoryUsage * 0.8,
        startTime,
        details,
      });
    } catch {
      return this.makeResult('unhealthy', 'Memory check failed', startTime);
    }
  }

  private async checkResponseTime(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const { requests } = this.metrics.getMetrics();
      const { averageResponseTime: avg, totalRequests } = requests;
      const details = { avgResponseTime: Math.round(avg), requestCount: totalRequests };
      // Response time uses absolute ms values, not percentages — format without %
      if (avg > this.maxResponseTime) {
        return this.makeResult('unhealthy', `Response time too high: ${avg.toFixed(0)}ms`, startTime, details);
      }
      if (avg > this.maxResponseTime * 0.8) {
        return this.makeResult('degraded', `Response time elevated: ${avg.toFixed(0)}ms`, startTime, details);
      }
      return this.makeResult('healthy', `Response time normal: ${avg.toFixed(0)}ms`, startTime, details);
    } catch {
      return this.makeResult('unhealthy', 'Response time check failed', startTime);
    }
  }

  private async checkErrorRate(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const { totalRequests, failedRequests } =
        this.metrics.getMetrics().requests;
      const errorRate = totalRequests > 0
        ? Math.min((failedRequests / totalRequests) * 100, 100)
        : 0;
      const details = { totalRequests, failedRequests, errorRate };
      return this.evaluateMetric({
        label: 'Error rate',
        value: errorRate,
        threshold: this.errorRateUnhealthy,
        degradedThreshold: this.errorRateDegraded,
        startTime,
        details,
      });
    } catch {
      return this.makeResult(
        'unhealthy', 'Error rate check failed', startTime,
      );
    }
  }

  private async checkStorage(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const stats = this.storage.getStats();
      const usagePercent = stats.historyCapacity > 0
        ? (stats.historySize / stats.historyCapacity) * 100
        : 0;
      const details = {
        historySize: stats.historySize,
        historyCapacity: stats.historyCapacity,
        usagePercent: Math.round(usagePercent),
      };
      return this.evaluateMetric({
        label: 'Storage usage',
        value: usagePercent,
        threshold: this.maxStorageUsage,
        degradedThreshold: this.maxStorageUsage * 0.8,
        startTime,
        details,
      });
    } catch {
      return this.makeResult(
        'unhealthy', 'Storage check failed', startTime,
      );
    }
  }

  private async checkSecurity(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      return this.makeResult('healthy', 'Security systems operational', startTime, this.security.getSecurityStatus());
    } catch {
      return this.makeResult('unhealthy', 'Security check failed', startTime);
    }
  }
}
