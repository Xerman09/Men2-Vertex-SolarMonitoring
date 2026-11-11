import { createLogger } from './logger';

const log = createLogger('FileHistoryCache');

export interface HistoryCacheItem<T = unknown> {
  data: T;
  savedAt: string;
  immutable?: boolean;
  expiresAt?: number;
}

function getFs(): typeof import('fs') | null {
  if (typeof window !== 'undefined') return null;
  try {
    return eval('require')('fs');
  } catch {
    return null;
  }
}

function getPath(): typeof import('path') | null {
  if (typeof window !== 'undefined') return null;
  try {
    return eval('require')('path');
  } catch {
    return null;
  }
}

export class FileHistoryCache {
  private static store = new Map<string, HistoryCacheItem<unknown>>();
  private static isLoaded = false;
  private static saveTimeout: NodeJS.Timeout | null = null;

  public static getCacheFilePath(): string {
    const pathMod = getPath();
    const dataDir = process.env.DSM_DATA_DIR || (process.cwd ? process.cwd() : '.');
    return pathMod ? pathMod.resolve(dataDir, 'deye-history-cache.json') : 'deye-history-cache.json';
  }

  private static ensureLoaded(): void {
    if (this.isLoaded) return;
    this.isLoaded = true;
    const fsMod = getFs();
    if (!fsMod) return;

    const filePath = this.getCacheFilePath();
    try {
      if (fsMod.existsSync(filePath)) {
        const raw = fsMod.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object') {
          for (const [k, v] of Object.entries(parsed.entries)) {
            if (v && typeof v === 'object' && 'data' in v) {
              this.store.set(k, v as HistoryCacheItem<unknown>);
            }
          }
        }
      }
    } catch (err) {
      log.warn('Failed reading deye-history-cache.json', {}, err);
    }
  }

  public static get<T>(key: string): T | null {
    this.ensureLoaded();
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  public static has(key: string): boolean {
    this.ensureLoaded();
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  public static set<T>(
    key: string,
    data: T,
    opts?: { immutable?: boolean; ttlMs?: number; immediateSave?: boolean }
  ): void {
    this.ensureLoaded();
    const isImmutable = opts?.immutable ?? true;
    const expiresAt = opts?.ttlMs ? Date.now() + opts.ttlMs : undefined;

    this.store.set(key, {
      data,
      savedAt: new Date().toISOString(),
      immutable: isImmutable,
      expiresAt,
    });

    if (isImmutable) {
      if (opts?.immediateSave) {
        this.flushToDisk();
      } else {
        this.scheduleDebouncedSave();
      }
    }
  }

  private static scheduleDebouncedSave(): void {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.flushToDisk();
    }, 150);
  }

  public static flushToDisk(): boolean {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    const fsMod = getFs();
    if (!fsMod) return false;

    const filePath = this.getCacheFilePath();
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    try {
      const serializableEntries: Record<string, HistoryCacheItem<unknown>> = {};
      const now = Date.now();
      for (const [k, v] of this.store.entries()) {
        if (v.immutable || (v.expiresAt && v.expiresAt > now)) {
          serializableEntries[k] = v;
        }
      }
      const payload = {
        updatedAt: new Date().toISOString(),
        entries: serializableEntries,
      };
      fsMod.writeFileSync(tempPath, JSON.stringify(payload), 'utf8');
      fsMod.renameSync(tempPath, filePath);
      return true;
    } catch (err) {
      if (fsMod.existsSync(tempPath)) {
        try {
          fsMod.unlinkSync(tempPath);
        } catch {}
      }
      log.error('Failed writing deye-history-cache.json to disk', err);
      return false;
    }
  }

  public static clear(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.store.clear();
    this.isLoaded = true;
    const fsMod = getFs();
    if (!fsMod) return;

    const filePath = this.getCacheFilePath();
    try {
      if (fsMod.existsSync(filePath)) {
        fsMod.unlinkSync(filePath);
      }
    } catch {}
  }

  public static size(): number {
    this.ensureLoaded();
    return this.store.size;
  }
}

export const fileHistoryCache = FileHistoryCache;