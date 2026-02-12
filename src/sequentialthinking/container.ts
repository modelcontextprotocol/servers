import type {
  AppConfig,
  ServiceContainer,
  Logger,
  ThoughtFormatter,
  ThoughtStorage,
  SecurityService,
  MetricsCollector,
  HealthChecker,
} from './interfaces.js';

// Import all required implementations
import { ConfigManager } from './config.js';
import { StructuredLogger } from './logger.js';
import { ConsoleThoughtFormatter } from './formatter.js';
import { SecureThoughtStorage } from './storage.js';
import {
  SecureThoughtSecurity,
  SecurityServiceConfigSchema,
} from './security-service.js';
import { BasicMetricsCollector } from './metrics.js';
import { ComprehensiveHealthChecker } from './health-checker.js';

export class SimpleContainer implements ServiceContainer {
  private readonly services = new Map<string, () => unknown>();
  private readonly instances = new Map<string, unknown>();
  private destroyed = false;

  register<T>(key: string, factory: () => T): void {
    this.services.set(key, factory);
    // Clear any existing instance when re-registering
    this.instances.delete(key);
  }

  get<T>(key: string): T {
    if (this.instances.has(key)) {
      return this.instances.get(key) as T;
    }

    const factory = this.services.get(key);
    if (!factory) {
      throw new Error(`Service '${key}' not registered`);
    }

    const instance = factory();
    this.instances.set(key, instance);
    return instance as T;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Cleanup all instances
    for (const [key, instance] of this.instances.entries()) {
      const obj = instance as Record<string, unknown>;
      if (obj && typeof obj.destroy === 'function') {
        try {
          (obj.destroy as () => void)();
        } catch (error) {
          console.error(`Error destroying service '${key}':`, error);
        }
      }
    }
    this.instances.clear();
    this.services.clear();
  }
}

export class SequentialThinkingApp {
  private readonly container: ServiceContainer;
  private readonly config: AppConfig;

  constructor(config?: AppConfig) {
    this.config = config ?? ConfigManager.load();
    ConfigManager.validate(this.config);
    this.container = new SimpleContainer();
    this.registerServices();
  }

  private registerServices(): void {
    this.container.register('config', () => this.config);
    this.container.register('logger', () => this.createLogger());
    this.container.register('formatter', () => this.createFormatter());
    this.container.register('storage', () => this.createStorage());
    this.container.register('security', () => this.createSecurity());
    this.container.register('metrics', () => this.createMetrics());
    this.container.register('healthChecker', () => this.createHealthChecker());
  }

  private createLogger(): Logger {
    return new StructuredLogger(this.config.logging);
  }

  private createFormatter(): ThoughtFormatter {
    return new ConsoleThoughtFormatter(this.config.logging.enableColors);
  }

  private createStorage(): ThoughtStorage {
    return new SecureThoughtStorage(this.config.state);
  }

  private createSecurity(): SecurityService {
    return new SecureThoughtSecurity(
      SecurityServiceConfigSchema.parse({
        ...this.config.security,
        maxThoughtLength: this.config.state.maxThoughtLength,
        blockedPatterns: this.config.security.blockedPatterns.map(
          (p: RegExp) => p.source,
        ),
      }),
    );
  }

  private createMetrics(): MetricsCollector {
    return new BasicMetricsCollector();
  }

  private createHealthChecker(): HealthChecker {
    const metrics = this.container.get<MetricsCollector>('metrics');
    const storage = this.container.get<ThoughtStorage>('storage');
    const security = this.container.get<SecurityService>('security');

    return new ComprehensiveHealthChecker(
      metrics,
      storage,
      security,
      this.config.monitoring.healthThresholds,
    );
  }

  getContainer(): ServiceContainer {
    return this.container;
  }

  destroy(): void {
    this.container.destroy();
  }
}
