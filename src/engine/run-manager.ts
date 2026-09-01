import * as fs from 'fs';
import * as path from 'path';
import { ulid } from 'ulid';
import type { RunManifest } from '../types.js';
import { StateStore } from '../state/state-store.js';
import { HARNESS_DIR_NAME } from '../constants.js';

const SCHEMA_VERSION = '2.0' as const;

export interface RunPaths {
  runDir: string;
  manifestFile: string;
  stateFile: string;
  eventsFile: string;
  attemptDir: (n: number) => string;
}

export class RunManager {
  private baseDir: string;

  constructor(cwd: string) {
    this.baseDir = path.join(cwd, HARNESS_DIR_NAME, 'runs');
  }

  create(task: string, options: { profile: string; provider: string; gitBranch?: string; gitCommit?: string }): { runId: string; paths: RunPaths; manifest: RunManifest } {
    const runId = ulid();
    const runDir = path.join(this.baseDir, runId);
    fs.mkdirSync(runDir, { recursive: true });
    fs.mkdirSync(path.join(runDir, 'attempts', '1'), { recursive: true });

    const manifest: RunManifest = {
      schema_version: SCHEMA_VERSION,
      run_id: runId,
      task,
      profile: options.profile,
      provider: options.provider,
      created_at: new Date().toISOString(),
      cwd: process.cwd(),
      git_branch: options.gitBranch,
      git_commit: options.gitCommit,
    };

    const paths = this.buildPaths(runDir);
    fs.writeFileSync(paths.manifestFile, JSON.stringify(manifest, null, 2), 'utf8');

    const store = new StateStore(runDir);
    store.initialize(runId);

    return { runId, paths, manifest };
  }

  load(runId: string): { runDir: string; paths: RunPaths } {
    const runDir = path.join(this.baseDir, runId);
    if (!fs.existsSync(runDir)) {
      throw new Error(`Run not found: ${runId}`);
    }
    return { runDir, paths: this.buildPaths(runDir) };
  }

  list(): string[] {
    if (!fs.existsSync(this.baseDir)) return [];
    return fs.readdirSync(this.baseDir).filter((entry) => {
      return fs.statSync(path.join(this.baseDir, entry)).isDirectory();
    });
  }

  private buildPaths(runDir: string): RunPaths {
    return {
      runDir,
      manifestFile: path.join(runDir, 'manifest.json'),
      stateFile:    path.join(runDir, 'state.json'),
      eventsFile:   path.join(runDir, 'events.jsonl'),
      attemptDir:   (n: number) => path.join(runDir, 'attempts', String(n)),
    };
  }
}
