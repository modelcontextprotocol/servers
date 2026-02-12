export interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  nextThoughtNeeded: boolean;
  timestamp?: number;
  sessionId?: string;
}

export class CircularBuffer<T> {
  private buffer: T[];
  private head: number = 0;
  private size: number = 0;
  
  constructor(private readonly capacity: number) {
    if (capacity < 1 || !Number.isInteger(capacity)) {
      throw new Error('CircularBuffer capacity must be a positive integer');
    }
    this.buffer = new Array(capacity);
  }
  
  add(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
  }
  
  getAll(limit?: number): T[] {
    if (limit !== undefined && limit < this.size) {
      if (limit <= 0) return [];
      // Return most recent items
      const start = (this.head - limit + this.capacity) % this.capacity;
      return this.getRange(start, limit);
    }
    return this.getRange(0, this.size);
  }
  
  getRange(start: number, count: number): T[] {
    const result: T[] = [];
    
    for (let i = 0; i < count; i++) {
      const index = (this.head - this.size + start + i + this.capacity) % this.capacity;
      const item = this.buffer[index];
      if (item !== undefined) {
        result.push(item);
      }
    }
    
    return result;
  }
  
  get currentSize(): number {
    return this.size;
  }
  
  get isFull(): boolean {
    return this.size === this.capacity;
  }
  
  clear(): void {
    this.head = 0;
    this.size = 0;
    this.buffer = new Array(this.capacity);
  }
  
  getOldest(): T | undefined {
    if (this.size === 0) return undefined;
    const oldestIndex = (this.head - this.size + this.capacity) % this.capacity;
    return this.buffer[oldestIndex];
  }
  
  getNewest(): T | undefined {
    if (this.size === 0) return undefined;
    const newestIndex = (this.head - 1 + this.capacity) % this.capacity;
    return this.buffer[newestIndex];
  }
}
