import fs from 'fs';
import path from 'path';
import { DeyeAccountConfig } from './types';
import { createLogger } from './logger';

const log = createLogger('FileAccountCache');

export class FileAccountCache {
  public static getConfigPath(): string {
    const dataDir = process.env.DSM_DATA_DIR || process.cwd();
    return path.resolve(dataDir, 'deye-accounts.json');
  }

  public static getAllRawAccounts(_forceReload = false): DeyeAccountConfig[] {
    const configPath = this.getConfigPath();
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.accounts)) {
          return parsed.accounts;
        }
      }
    } catch (e) {
      log.warn('Failed reading raw deye-accounts.json', {}, e);
    }
    return [];
  }

  public static saveAccountsToFile(accounts: DeyeAccountConfig[]): boolean {
    const configPath = this.getConfigPath();
    const tempPath = `${configPath}.tmp.${Date.now()}`;
    try {
      const payload = { accounts };
      fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tempPath, configPath);
      return true;
    } catch (e) {
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (unlinkErr) {
          log.warn('Failed cleaning up temporary accounts file', {}, unlinkErr);
        }
      }
      log.error('Failed saving accounts to disk', e);
      return false;
    }
  }
}
