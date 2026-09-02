import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { detectProfile } from '../../profiles/detector.js';
import { HARNESS_DIR_NAME, HARNESS_NAME_WITH_VERSION } from '../../constants.js';

const CODEX_TEMPLATE_DIR = path.resolve(__dirname, '../../../templates/codex');

const CODEX_FILES = [
  'config.toml',
  'global-rules.md',
  path.join('agents', 'planner.toml'),
  path.join('agents', 'implementer.toml'),
  path.join('agents', 'tester.toml'),
  path.join('agents', 'reviewer.toml'),
];

const CONFIG_TEMPLATE = `# ${HARNESS_NAME_WITH_VERSION} Configuration
# https://github.com/danish505/OpenHarness
version: 2

# Detected profile (laravel | generic)
profile: PROFILE_PLACEHOLDER

workflow:
  max_attempts: 3
  plan_approval: required     # required | automatic
  review_approval: automatic  # required | automatic
  plan_export_directory: .largentic/exports  # directory for exported plan.md files

agents:
  planner:
    provider: codex
    reasoning: high
  implementer:
    provider: codex
    reasoning: medium
  tester:
    provider: codex
    reasoning: medium
  reviewer:
    provider: codex
    reasoning: high

quality_gates:
  require_tests: true
  require_clean_secrets_scan: true
  max_changed_files: 25
  # test_command: vendor/bin/phpunit --no-coverage --testdox
  # build_command: npm run build

budget:
  max_runtime_minutes: 45
  max_estimated_cost_usd: 10

# provider: codex   # override global default provider
`;

export function initCommand(cwd: string): void {
  const harnessDir = path.join(cwd, HARNESS_DIR_NAME);
  const configPath = path.join(harnessDir, 'config.yaml');

  if (fs.existsSync(configPath)) {
    console.log(`✓ Config already exists: ${configPath}`);
    console.log('  Run "lh config validate" to check it, or edit it manually.');
    return;
  }

  fs.mkdirSync(harnessDir, { recursive: true });
  fs.mkdirSync(path.join(harnessDir, 'runs'), { recursive: true });

  const detection = detectProfile(cwd);
  const config = CONFIG_TEMPLATE.replace('PROFILE_PLACEHOLDER', detection.profile);
  fs.writeFileSync(configPath, config, 'utf8');

  const taskPath = path.join(harnessDir, 'task.md');
  if (!fs.existsSync(taskPath)) {
    fs.writeFileSync(taskPath, '# Task\n\nReplace this with your task description. This file is used when you run `lh run` without an inline prompt.\n', 'utf8');
  }

  const codexDir = path.join(cwd, '.codex');
  const codexAgentsDir = path.join(codexDir, 'agents');
  fs.mkdirSync(codexAgentsDir, { recursive: true });

  let codexFilesDeployed = 0;
  for (const relativePath of CODEX_FILES) {
    const sourcePath = path.join(CODEX_TEMPLATE_DIR, relativePath);
    const targetPath = path.join(codexDir, relativePath);

    if (fs.existsSync(sourcePath) && !fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
      codexFilesDeployed++;
    }
  }

  console.log(`✓ Initialized ${HARNESS_NAME_WITH_VERSION}`);
  console.log(`  Config:    ${configPath}`);
  console.log(`  Task file: ${taskPath}  (edit to define your default task)`);
  console.log(`  Profile detected: ${detection.profile}`);
  detection.hints.forEach((h) => console.log(`    • ${h}`));
  if (codexFilesDeployed > 0) {
    console.log(`  Codex setup: ${codexFilesDeployed} file(s) deployed to ${codexDir}`);
    console.log('    Customize .codex/global-rules.md and .codex/agents/*.toml per project.');
  }
  console.log('\n  Next: run "lh doctor" to verify your environment.');
}
