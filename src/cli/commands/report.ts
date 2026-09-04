import * as fs from 'fs';
import { RunManager } from '../../engine/run-manager.js';
import { StateStore } from '../../state/state-store.js';
import { EventLogger } from '../../telemetry/event-logger.js';
import { HARNESS_NAME_WITH_VERSION } from '../../constants.js';

export function reportCommand(runId: string, cwd: string): void {
  const manager = new RunManager(cwd);
  try {
    const { runDir, paths } = manager.load(runId);
    const manifest = JSON.parse(fs.readFileSync(paths.manifestFile, 'utf8'));
    const state    = new StateStore(runDir).read();
    const logger   = new EventLogger(paths.eventsFile);
    const events   = logger.readAll();

    const startedAt  = new Date(manifest.created_at);
    const updatedAt  = new Date(state.updated_at);
    const elapsedMin = ((updatedAt.getTime() - startedAt.getTime()) / 60000).toFixed(1);

    const stageEvents = events.filter((e) =>
      ['stage_complete', 'stage_failed'].includes(e.type)
    );

    const optEvents = events.filter((e) => e.type === 'context_optimization');
    let optSection = '';
    if (optEvents.length > 0) {
      optSection = [
        `## Context Optimization`,
        `| Stage | Attempt | Original Tokens | Optimized Tokens | Saved Tokens | Savings % | Cache Hits |`,
        `|---|---|---|---|---|---|---|`,
        ...optEvents.map((e) => {
          const savingsPct = e['originalTokens'] ? (((e['savedTokens'] as number) / (e['originalTokens'] as number)) * 100).toFixed(1) : '0.0';
          return `| ${e['stage']} | ${e['attempt']} | ${e['originalTokens']} | ${e['optimizedTokens']} | ${e['savedTokens']} | ${savingsPct}% | ${e['cacheHits']} |`;
        }),
        ``,
      ].join('\n');
    }

    const artifactFiles = ['plan.md', 'implementation.md', 'test-results.md', 'review.md'];
    const artifacts = artifactFiles
      .filter((f) => fs.existsSync(require('path').join(runDir, f)))
      .map((f) => `  - ${f}`);

    const report = [
      `# ${HARNESS_NAME_WITH_VERSION} — Run Report`,
      ``,
      `**Run ID:** ${runId}`,
      `**Task:** ${manifest.task}`,
      `**Status:** ${state.status.toUpperCase()}`,
      `**Profile:** ${manifest.profile}`,
      `**Provider:** ${manifest.provider}`,
      `**Branch:** ${manifest.git_branch ?? 'unknown'}`,
      `**Commit:** ${manifest.git_commit ?? 'unknown'}`,
      `**Started:** ${manifest.created_at}`,
      `**Elapsed:** ${elapsedMin} min`,
      ``,
      optSection,
      `## Timeline`,
      ...stageEvents.map(
        (e) => `- [${e['timestamp']}] ${e.type}: stage=${e['stage']} attempt=${e['attempt']}`
      ),
      ``,
      `## Artifacts Produced`,
      ...artifacts,
      ``,
      `## Final State`,
      `\`\`\`json`,
      JSON.stringify(state, null, 2),
      `\`\`\``,
      ``,
    ].join('\n');

    console.log(report);
  } catch (e: unknown) {
    console.error(`❌ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}
