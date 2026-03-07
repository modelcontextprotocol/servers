import { describe, it, expect, vi, afterEach } from 'vitest';
import { SimpleContainer, SequentialThinkingApp } from '../../container.js';

describe('SimpleContainer', () => {
  it('should register and retrieve a service', () => {
    const container = new SimpleContainer();
    container.register('greeting', () => 'hello');
    expect(container.get<string>('greeting')).toBe('hello');
  });

  it('should return cached instance on second get', () => {
    const container = new SimpleContainer();
    let callCount = 0;
    container.register('counter', () => ++callCount);
    expect(container.get<number>('counter')).toBe(1);
    expect(container.get<number>('counter')).toBe(1); // Same instance
  });

  it('should throw for unregistered service', () => {
    const container = new SimpleContainer();
    expect(() => container.get('nonexistent')).toThrow("Service 'nonexistent' not registered");
  });

  it('should call destroy on services that have it', () => {
    const container = new SimpleContainer();
    const destroyFn = vi.fn();
    container.register('svc', () => ({ destroy: destroyFn }));
    container.get('svc'); // Instantiate
    container.destroy();
    expect(destroyFn).toHaveBeenCalledTimes(1);
  });

  it('should handle destroy throwing without crashing', () => {
    const container = new SimpleContainer();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    container.register('bad', () => ({
      destroy: () => { throw new Error('boom'); },
    }));
    container.get('bad');
    expect(() => container.destroy()).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('should clear cached instance on re-register', () => {
    const container = new SimpleContainer();
    container.register('svc', () => 'v1');
    expect(container.get<string>('svc')).toBe('v1');
    container.register('svc', () => 'v2');
    expect(container.get<string>('svc')).toBe('v2');
  });

  it('should not call factory until first get (lazy instantiation)', () => {
    const container = new SimpleContainer();
    const factory = vi.fn(() => 'lazy-value');
    container.register('lazy', factory);
    expect(factory).not.toHaveBeenCalled();
    const value = container.get<string>('lazy');
    expect(factory).toHaveBeenCalledTimes(1);
    expect(value).toBe('lazy-value');
  });

  describe('double-destroy safety', () => {
    it('should not throw on double destroy', () => {
      const container = new SimpleContainer();
      const destroyFn = vi.fn();
      container.register('svc', () => ({ destroy: destroyFn }));
      container.get('svc'); // Instantiate

      container.destroy();
      container.destroy(); // Second call should be no-op

      expect(destroyFn).toHaveBeenCalledTimes(1);
    });
  });
});

describe('SequentialThinkingApp', () => {
  let app: SequentialThinkingApp;

  afterEach(() => {
    app?.destroy();
  });

  it('should create app with default config', () => {
    app = new SequentialThinkingApp();
    expect(app.getContainer()).toBeDefined();
  });

  it('should resolve registered services', () => {
    app = new SequentialThinkingApp();
    const container = app.getContainer();
    expect(() => container.get('config')).not.toThrow();
    expect(() => container.get('logger')).not.toThrow();
    expect(() => container.get('formatter')).not.toThrow();
    expect(() => container.get('storage')).not.toThrow();
    expect(() => container.get('security')).not.toThrow();
    expect(() => container.get('metrics')).not.toThrow();
    expect(() => container.get('healthChecker')).not.toThrow();
  });

  it('should destroy without errors', () => {
    app = new SequentialThinkingApp();
    // Force instantiation
    app.getContainer().get('storage');
    expect(() => app.destroy()).not.toThrow();
  });
});
