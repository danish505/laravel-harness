import * as fs from 'fs';
import * as path from 'path';
import { HARNESS_DIR_NAME } from '../constants.js';

export class ContextRecoveryRegistry {
  private registryFile: string;

  constructor(cwd: string) {
    this.registryFile = path.join(cwd, HARNESS_DIR_NAME, 'cache', 'context', 'recovery-registry.json');
  }

  private load(): Record<string, string> {
    if (!fs.existsSync(this.registryFile)) {
      return {};
    }
    try {
      return JSON.parse(fs.readFileSync(this.registryFile, 'utf8'));
    } catch {
      return {};
    }
  }

  private save(registry: Record<string, string>): void {
    try {
      fs.mkdirSync(path.dirname(this.registryFile), { recursive: true });
      fs.writeFileSync(this.registryFile, JSON.stringify(registry, null, 2), 'utf8');
    } catch {
      // safe fallback
    }
  }

  /**
   * Register a compressed content hash to its original file path
   */
  public register(compressedHash: string, originalPath: string): void {
    const registry = this.load();
    registry[compressedHash] = originalPath;
    this.save(registry);
  }

  /**
   * Look up original path for a compressed content hash
   */
  public getOriginalPath(compressedHash: string): string | null {
    const registry = this.load();
    return registry[compressedHash] || null;
  }
}
