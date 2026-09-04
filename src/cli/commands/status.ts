import * as fs from 'fs';
import * as path from 'path';
import { RunManager } from '../../engine/run-manager.js';
import { StateStore } from '../../state/state-store.js';
import { EventLogger } from '../../telemetry/event-logger.js';

export function statusCommand(runId: string, cwd: string): void {
  const manager = new RunManager(cwd);
  try {
    const { runDir, paths } = manager.load(runId);
    const manifest = JSON.parse(fs.readFileSync(paths.manifestFile, 'utf8'));
    const state    = new StateStore(runDir).read();

    const elapsed = Math.round(
      (Date.now() - new Date(state.created_at).getTime()) / 1000
    );

    console.log(`\nRun: ${runId}`);
    console.log(`  Task   : ${manifest.task}`);
    console.log(`  Status : ${state.status}`);
    console.log(`  Attempt: ${state.attempt}`);
    console.log(`  Elapsed: ${elapsed}s`);
    console.log(`  Updated: ${state.updated_at}`);
    if (state.failure_reason) console.log(`  Reason : ${state.failure_reason}`);

    // Read context optimization event logs if any
    try {
      const logger = new EventLogger(paths.eventsFile);
      const events = logger.readAll();
      const optEvents = events.filter((e) => e.type === 'context_optimization');
      if (optEvents.length > 0) {
        console.log(`  Context Optimization:`);
        let totalSaved = 0;
        let totalOriginal = 0;
        let totalFallbacks = 0;
        let totalHits = 0;
        let totalMisses = 0;

        for (const e of optEvents) {
          totalSaved += (e.savedTokens as number) || 0;
          totalOriginal += (e.originalTokens as number) || 0;
          totalFallbacks += (e.fallbacks as number) || 0;
          totalHits += (e.cacheHits as number) || 0;
          totalMisses += (e.cacheMisses as number) || 0;
        }
        const savingsPct = totalOriginal > 0 ? ((totalSaved / totalOriginal) * 100).toFixed(1) : '0.0';
        console.log(`    Original Tokens: ${totalOriginal}`);
        console.log(`    Saved Tokens   : ${totalSaved} (${savingsPct}%)`);
        console.log(`    Cache Hits     : ${totalHits} / Misses: ${totalMisses}`);
        if (totalFallbacks > 0) {
          console.log(`    Fallbacks      : ${totalFallbacks} (Validation failure/outages)`);
        }
      }
    } catch {
      // Ignore reading issues
    }

    console.log('');
  } catch (e: unknown) {
    console.error(`❌ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

export function inspectCommand(runId: string, cwd: string): void {
  const manager = new RunManager(cwd);
  try {
    const { runDir, paths } = manager.load(runId);
    const manifest = JSON.parse(fs.readFileSync(paths.manifestFile, 'utf8'));
    const state    = new StateStore(runDir).read();
    const logger   = new EventLogger(paths.eventsFile);
    const events   = logger.readAll();

    console.log(`\n=== Run ${runId} ===`);
    console.log(JSON.stringify(manifest, null, 2));
    console.log('\n=== State ===');
    console.log(JSON.stringify(state, null, 2));
    console.log(`\n=== Events (${events.length}) ===`);
    events.forEach((e) => console.log(JSON.stringify(e)));
    console.log('');
  } catch (e: unknown) {
    console.error(`❌ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

export function cancelCommand(runId: string, cwd: string): void {
  const manager = new RunManager(cwd);
  try {
    const { runDir, paths } = manager.load(runId);
    const store  = new StateStore(runDir);
    const logger = new EventLogger(paths.eventsFile);
    const state  = store.read();

    if (['approved', 'cancelled', 'failed', 'blocked'].includes(state.status)) {
      console.log(`Run ${runId} is already in terminal state: ${state.status}`);
      return;
    }

    store.transition('cancelled', { actor: 'human', failureReason: 'Cancelled by user' });
    logger.termination(runId, 'Cancelled by user via lh cancel', 'cancelled');

    // Release lock if held
    const lockFile = path.join(runDir, '.lock');
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

    console.log(`✅ Run ${runId} cancelled.`);
  } catch (e: unknown) {
    console.error(`❌ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

export function resumeCommand(runId: string, cwd: string, options: { autoApprove?: boolean } = {}): void {
  // Resume is handled by runCommand loading existing run state
  // For now, delegate to the workflow engine via run command
  const { runCommand } = require('./run.js');
  const manager = new RunManager(cwd);
  const { runDir, paths } = manager.load(runId);
  const state = new StateStore(runDir).read();
  const manifest = JSON.parse(fs.readFileSync(paths.manifestFile, 'utf8'));

  console.log(`\n⏩ Resuming run ${runId} from state: ${state.status}`);
  runCommand(manifest.task, cwd, options).catch((e: Error) => {
    console.error(`❌ Resume failed: ${e.message}`);
    process.exitCode = 6;
  });
}
