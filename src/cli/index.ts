#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import { initCommand } from './commands/init.js';
import { doctorCommand } from './commands/doctor.js';
import { configValidateCommand, configShowCommand } from './commands/config.js';
import { runCommand } from './commands/run.js';
import { statusCommand, inspectCommand, cancelCommand } from './commands/status.js';
import { reportCommand } from './commands/report.js';
import { HARNESS_DIR_NAME, HARNESS_NAME_WITH_VERSION } from '../constants.js';

const cwd = process.cwd();

const program = new Command();

program
  .name('lh')
  .description(`${HARNESS_NAME_WITH_VERSION} — AI-powered software-engineering workflow`)
  .version('2.0.0-alpha.0');

program
  .command('init')
  .description(`Initialise ${HARNESS_NAME_WITH_VERSION} in the current project`)
  .action(() => initCommand(cwd));

program
  .command('doctor')
  .description('Check environment prerequisites and configuration')
  .action(() => doctorCommand(cwd));

const configCmd = program.command('config').description('Configuration commands');

configCmd
  .command('validate')
  .description('Validate the current config file')
  .action(() => configValidateCommand(cwd));

configCmd
  .command('show')
  .description('Print the merged configuration')
  .action(() => configShowCommand(cwd));

program
  .command('run [task]')
  .description(`Run the full four-stage workflow. Pass the task inline or define it in ${HARNESS_DIR_NAME}/task.md`)
  .option('--auto-approve', 'Skip interactive approval prompts (for scripting)')
  .option('--provider <name>', 'Override provider (codex | fake)')
  .action(async (task: string | undefined, opts: { autoApprove?: boolean; provider?: string }) => {
    await runCommand(task, cwd, { autoApprove: opts.autoApprove, provider: opts.provider });
  });

program
  .command('status <run-id>')
  .description('Show the current status of a run')
  .action((runId: string) => statusCommand(runId, cwd));

program
  .command('inspect <run-id>')
  .description('Print full manifest, state, and event log for a run')
  .action((runId: string) => inspectCommand(runId, cwd));

program
  .command('cancel <run-id>')
  .description('Cancel a running or paused run')
  .action((runId: string) => cancelCommand(runId, cwd));

program
  .command('report <run-id>')
  .description('Print a consolidated Markdown report for a run')
  .action((runId: string) => reportCommand(runId, cwd));

program.parse(process.argv);
