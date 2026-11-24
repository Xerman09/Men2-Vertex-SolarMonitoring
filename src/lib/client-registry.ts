import { DeyeCloudClient } from './deye-client';
import { DeyeAccountConfig } from './types';

export class ClientRegistry {
  private clientMap: Map<string, DeyeCloudClient> = new Map();

  /**
   * Synchronize active DeyeCloudClient instances with enabled accounts.
   * Preserves existing instances so in-memory token caches are retained.
   */
  public syncClients(configs: DeyeAccountConfig[]): void {
    const validIds = new Set(configs.map((acc) => acc.id));

    // Remove obsolete clients
    for (const id of Array.from(this.clientMap.keys())) {
      if (!validIds.has(id)) {
        this.clientMap.delete(id);
      }
    }

    // Add or update existing clients
    for (const config of configs) {
      const existing = this.clientMap.get(config.id);
      if (existing) {
        existing.updateConfig(config);
      } else {
        this.clientMap.set(config.id, new DeyeCloudClient(config));
      }
    }
  }

  /**
   * Get client for specific account.
   * If accountId is provided, returns that account's client or null if not found.
   * If accountId is omitted, returns the primary/first configured client or null.
   */
  public getClient(accountId?: string): DeyeCloudClient | null {
    if (accountId) {
      const direct = this.clientMap.get(accountId);
      if (direct) return direct;

      // Secondary resolution: match by directusId, email, or associated plant stationId
      const cleanId = accountId.startsWith('station-') ? accountId.replace('station-', '') : accountId;
      for (const client of this.clientMap.values()) {
        if (
          client.directusId === accountId ||
          client.directusId === cleanId ||
          (client.accountEmail && client.accountEmail.toLowerCase() === accountId.toLowerCase()) ||
          client.plants?.some((p) => String(p.stationId) === cleanId || String(p.stationId) === accountId)
        ) {
          return client;
        }
      }
      return null;
    }
    const firstClient = this.clientMap.values().next().value;
    return firstClient || null;
  }

  /**
   * Return all active client instances.
   */
  public getAllClients(): DeyeCloudClient[] {
    return Array.from(this.clientMap.values());
  }

  /**
   * Remove a client from registry by account ID.
   */
  public removeClient(accountId: string): boolean {
    return this.clientMap.delete(accountId);
  }

  /**
   * Explicitly set or override a client for an account ID.
   */
  public setClient(accountId: string, client: DeyeCloudClient): void {
    this.clientMap.set(accountId, client);
  }

  /**
   * Clear all registered clients (useful for testing or cache reset).
   */
  public clear(): void {
    this.clientMap.clear();
  }

  /**
   * Count of registered clients.
   */
  public get size(): number {
    return this.clientMap.size;
  }
}

export const clientRegistry = new ClientRegistry();
