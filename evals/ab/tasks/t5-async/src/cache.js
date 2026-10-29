export class Cache {
  constructor(loader) {
    this.loader = loader;
    this.values = new Map();
    this.loads = 0;
  }

  async get(key) {
    if (this.values.has(key)) return this.values.get(key);
    this.loads += 1;
    const value = this.loader(key);
    this.values.set(key, value);
    return value;
  }
}
