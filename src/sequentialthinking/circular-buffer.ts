export class CircularBuffer<T> {
  private buffer: T[];
  private head = 0;
  private size = 0;
  
  constructor(private readonly capacity: number) {
    if (capacity < 1 || !Number.isInteger(capacity)) {
      throw new Error('CircularBuffer capacity must be a positive integer');
    }
    this.buffer = new Array<T>(capacity);
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
  
  private getRange(start: number, count: number): T[] {
    const result: T[] = [];

    for (let i = 0; i < count; i++) {
      // Map logical index to physical buffer position with wrap-around
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
  
  clear(): void {
    this.head = 0;
    this.size = 0;
    this.buffer = new Array<T>(this.capacity);
  }
  
}
