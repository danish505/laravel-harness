import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { loadConfig, findConfigPath } from '../../config/loader.js';

interface Check {
  name: string;
  pass: boolean;
  message: string;
  fix?: string;
}

export function doctorCommand(cwd: string): void {
  const checks: Check[] = [];

  // Node version
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1), 10);
  checks.push({
    name: 'Node.js version',
    pass: major >= 20,
    message: `${nodeVersion} (requires >=20)`,
    fix: 'Install Node.js 20 LTS from https://nodejs.org',
  });

  // Git available
  let gitOk = false;
  try {
    execSync('git --version', { stdio: 'ignore' });
    gitOk = true;
  } catch { /* not found */ }
  checks.push({
    name: 'Git',
    pass: gitOk,
    message: gitOk ? 'found' : 'not found',
    fix: 'Install Git from https://git-scm.com',
  });

  // Git repo
  const isGitRepo = fs.existsSync(path.join(cwd, '.git'));
  checks.push({
    name: 'Git repository',
    pass: isGitRepo,
    message: isGitRepo ? `found at ${cwd}` : 'not a git repository',
    fix: 'Run "git init" to initialise a repository.',
  });

  // Config file
  const configPath = findConfigPath(cwd);
  const configExists = fs.existsSync(configPath);
  checks.push({
    name: 'Config file',
    pass: configExists,
    message: configExists ? configPath : 'not found',
    fix: 'Run "lh init" to create a config file.',
  });

  // Config valid
  if (configExists) {
    const { valid, errors } = loadConfig(configPath);
    checks.push({
      name: 'Config valid',
      pass: valid,
      message: valid ? 'valid' : errors.join('; '),
      fix: valid ? undefined : 'Edit .laravel-harness/config.yaml and fix the reported errors.',
    });
  }

  // Codex CLI
  let codexOk = false;
  try {
    execSync('codex --version', { stdio: 'ignore' });
    codexOk = true;
  } catch { /* not found */ }
  checks.push({
    name: 'Codex CLI',
    pass: codexOk,
    message: codexOk ? 'found' : 'not found (required for production runs)',
    fix: 'Install Codex CLI: https://github.com/openai/codex',
  });

  // Print results
  const allPass = checks.every((c) => c.pass);
  console.log('\nLaravel Harness V2 — Doctor\n');
  for (const c of checks) {
    const icon = c.pass ? '✅' : '❌';
    console.log(`  ${icon} ${c.name}: ${c.message}`);
    if (!c.pass && c.fix) console.log(`       Fix: ${c.fix}`);
  }
  console.log('');
  if (allPass) {
    console.log('  All checks passed. Ready to run: lh run "<task>"\n');
  } else {
    console.log('  Some checks failed. Fix the issues above before running.\n');
    process.exitCode = 1;
  }
}
