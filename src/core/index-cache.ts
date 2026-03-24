import type { IndexJson } from "./schemas.js";

type Entry = { mtimeMs: number; data: IndexJson };

export class IndexCache {
  private readonly map = new Map<string, Entry>();

  get(key: string, mtimeMs: number): IndexJson | undefined {
    const hit = this.map.get(key);
    if (hit && hit.mtimeMs === mtimeMs) return hit.data;
    return undefined;
  }

  set(key: string, mtimeMs: number, data: IndexJson): void {
    this.map.set(key, { mtimeMs, data });
  }

  invalidate(key: string): void {
    this.map.delete(key);
  }
}
