import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { HARNESS_DIR_NAME } from '../constants.js';

export interface CacheEntry {
  sourceHash: string;
  provider: string;
  policy: string;
  promptVersion: string;
  originalTokens: number;
  compressedTokens: number;
  compressedContent: string;
  createdAt: string;
}

export class ContextCache {
  private cacheDir: string;
  private artifactsDir: string;
  private manifestsDir: string;

  constructor(cwd: string) {
    this.cacheDir = path.join(cwd, HARNESS_DIR_NAME, 'cache', 'context');
    this.artifactsDir = path.join(this.cacheDir, 'artifacts');
    this.manifestsDir = path.join(this.cacheDir, 'manifests');
  }

  private ensureDirs(): void {
    fs.mkdirSync(this.artifactsDir, { recursive: true });
    fs.mkdirSync(this.manifestsDir, { recursive: true });
  }

  public computeKey(sourceContent: string, provider: string, policy: string, promptVersion: string): string {
    const salt = [sourceContent, provider, policy, promptVersion].join('|');
    return crypto.createHash('sha256').update(salt).digest('hex');
  }

  public get(key: string): CacheEntry | null {
    const manifestPath = path.join(this.manifestsDir, `${key}.json`);
    const artifactPath = path.join(this.artifactsDir, `${key}.md`);

    if (!fs.existsSync(manifestPath) || !fs.existsSync(artifactPath)) {
      return null;
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const compressedContent = fs.readFileSync(artifactPath, 'utf8');
      return {
        ...manifest,
        compressedContent,
      };
    } catch {
      return null;
    }
  }

  public set(key: string, entry: Omit<CacheEntry, 'compressedContent'>, compressedContent: string): void {
    this.ensureDirs();
    const manifestPath = path.join(this.manifestsDir, `${key}.json`);
    const artifactPath = path.join(this.artifactsDir, `${key}.md`);

    try {
      fs.writeFileSync(manifestPath, JSON.stringify(entry, null, 2), 'utf8');
      fs.writeFileSync(artifactPath, compressedContent, 'utf8');
    } catch {
      // Ignore cache write errors to not block execution
    }
  }

  public clear(): void {
    if (fs.existsSync(this.cacheDir)) {
      fs.rmSync(this.cacheDir, { recursive: true, force: true });
    }
  }
}
