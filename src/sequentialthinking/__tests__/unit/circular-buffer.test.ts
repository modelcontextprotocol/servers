import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircularBuffer } from '../../circular-buffer.js';

describe('CircularBuffer', () => {
  let buffer: CircularBuffer<string>;

  beforeEach(() => {
    buffer = new CircularBuffer<string>(3);
  });

  describe('Basic Operations', () => {
    it('should initialize with correct capacity', () => {
      expect(buffer.currentSize).toBe(0);
    });

    it('should add items correctly', () => {
      buffer.add('item1');
      expect(buffer.currentSize).toBe(1);
      
      buffer.add('item2');
      expect(buffer.currentSize).toBe(2);
      
      buffer.add('item3');
      expect(buffer.currentSize).toBe(3);
    });

    it('should overwrite old items when full', () => {
      buffer.add('item1');
      buffer.add('item2');
      buffer.add('item3');
      buffer.add('item4'); // Should overwrite item1

      expect(buffer.currentSize).toBe(3);

      const items = buffer.getAll();
      expect(items).toEqual(['item2', 'item3', 'item4']);
    });
  });

  describe('Retrieval Operations', () => {
    beforeEach(() => {
      buffer.add('first');
      buffer.add('second');
      buffer.add('third');
    });

    it('should retrieve all items', () => {
      const items = buffer.getAll();
      expect(items).toEqual(['first', 'second', 'third']);
    });

    it('should retrieve limited number of items', () => {
      const items = buffer.getAll(2);
      expect(items).toEqual(['second', 'third']); // Most recent 2
    });

  });

  describe('Edge Cases', () => {
    it('should handle empty buffer', () => {
      expect(buffer.getAll()).toEqual([]);
    });

    it('should handle limit larger than size', () => {
      buffer.add('item1');
      buffer.add('item2');
      
      const items = buffer.getAll(10);
      expect(items).toEqual(['item1', 'item2']);
    });

    it('should clear buffer correctly', () => {
      buffer.add('item1');
      buffer.add('item2');
      
      expect(buffer.currentSize).toBe(2);
      
      buffer.clear();
      
      expect(buffer.currentSize).toBe(0);
      expect(buffer.getAll()).toEqual([]);
    });
  });

  describe('Wrap-around Behavior', () => {
    it('should handle multiple wrap-arounds correctly', () => {
      const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
      
      items.forEach(item => buffer.add(item));
      
      // Buffer size should be 3 (capacity)
      expect(buffer.currentSize).toBe(3);

      // Should contain last 3 items
      const result = buffer.getAll();
      expect(result).toEqual(['e', 'f', 'g']);
    });

    it('should maintain order after wrap-around', () => {
      buffer.add('1');
      buffer.add('2');
      buffer.add('3');
      buffer.add('4');
      buffer.add('5');

      const items = buffer.getAll();
      expect(items).toEqual(['3', '4', '5']);
    });
  });

  describe('Capacity Edge Cases', () => {
    it('should handle capacity of 1', () => {
      const buf = new CircularBuffer<string>(1);

      buf.add('first');
      expect(buf.currentSize).toBe(1);
      expect(buf.getAll()).toEqual(['first']);

      buf.add('second');
      expect(buf.currentSize).toBe(1);
      expect(buf.getAll()).toEqual(['second']);
    });

    it('should handle large capacity', () => {
      const buf = new CircularBuffer<number>(10000);

      for (let i = 0; i < 100; i++) {
        buf.add(i);
      }

      expect(buf.currentSize).toBe(100);
    });
  });

  describe('Performance', () => {
    it('should handle large number of operations efficiently', () => {
      const start = Date.now();

      // Add many items
      for (let i = 0; i < 10000; i++) {
        buffer.add(`item-${i}`);
      }

      const duration = Date.now() - start;

      // Should be very fast
      expect(duration).toBeLessThan(100); // Less than 100ms
      expect(buffer.currentSize).toBe(3); // Still at capacity
    });
  });

  describe('getAll(0) returns empty', () => {
    it('should return empty array when limit is 0', () => {
      buffer.add('item1');
      buffer.add('item2');
      buffer.add('item3');
      expect(buffer.getAll(0)).toEqual([]);
    });
  });

  describe('Constructor validation', () => {
    it('should throw on capacity 0', () => {
      expect(() => new CircularBuffer(0)).toThrow('capacity must be a positive integer');
    });

    it('should throw on negative capacity', () => {
      expect(() => new CircularBuffer(-1)).toThrow('capacity must be a positive integer');
    });

    it('should throw on non-integer capacity', () => {
      expect(() => new CircularBuffer(1.5)).toThrow('capacity must be a positive integer');
    });
  });
});