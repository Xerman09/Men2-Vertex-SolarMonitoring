import { describe, it, expect } from 'vitest';
import { ClientRegistry } from '../client-registry';
import { DeyeAccountConfig } from '../types';

describe('ClientRegistry Unit Suite', () => {
  const mockConfigs: DeyeAccountConfig[] = [
    {
      id: 'acc-alpha',
      name: 'Alpha Station',
      email: 'alpha@solar.local',
      password: 'password123',
      appId: 'app-001',
      appSecret: 'secret-001',
      baseUrl: 'https://eu1-developer.deyecloud.com',
      enabled: true,
      plants: [],
    },
    {
      id: 'acc-beta',
      name: 'Beta Station',
      email: 'beta@solar.local',
      password: 'password456',
      appId: 'app-002',
      appSecret: 'secret-002',
      baseUrl: 'https://eu1-developer.deyecloud.com',
      enabled: true,
      plants: [],
    },
  ];

  it('syncs clients matching account configs and maintains instance registry', () => {
    const registry = new ClientRegistry();
    expect(registry.size).toBe(0);

    registry.syncClients(mockConfigs);
    expect(registry.size).toBe(2);

    const alphaClient = registry.getClient('acc-alpha');
    expect(alphaClient).not.toBeNull();
    expect(alphaClient?.accountId).toBe('acc-alpha');
    expect(alphaClient?.accountName).toBe('Alpha Station');

    const betaClient = registry.getClient('acc-beta');
    expect(betaClient).not.toBeNull();
    expect(betaClient?.accountId).toBe('acc-beta');

    // Default client returns first configured
    const defaultClient = registry.getClient();
    expect(defaultClient).not.toBeNull();
    expect(defaultClient?.accountId).toBe('acc-alpha');
  });

  it('prunes clients when accounts are removed or disabled', () => {
    const registry = new ClientRegistry();
    registry.syncClients(mockConfigs);
    expect(registry.size).toBe(2);

    // Sync with only Alpha
    registry.syncClients([mockConfigs[0]]);
    expect(registry.size).toBe(1);
    expect(registry.getClient('acc-beta')).toBeNull();
    expect(registry.getClient('acc-alpha')).not.toBeNull();
  });

  it('removes client on demand and clears cleanly', () => {
    const registry = new ClientRegistry();
    registry.syncClients(mockConfigs);

    const removed = registry.removeClient('acc-alpha');
    expect(removed).toBe(true);
    expect(registry.getClient('acc-alpha')).toBeNull();
    expect(registry.size).toBe(1);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.getAllClients()).toEqual([]);
  });
});
