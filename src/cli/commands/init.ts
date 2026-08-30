import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { detectProfile } from '../../profiles/detector.js';

const CONFIG_TEMPLATE = `# Laravel Harness V2 Configuration
# https://github.com/danish505/OpenHarness
version: 2

# Detected profile (laravel | generic)
profile: PROFILE_PLACEHOLDER

workflow:
  max_attempts: 3
  plan_approval: required     # required | automatic
  review_approval: automatic  # required | automatic

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
  const harnessDir = path.join(cwd, '.laravel-harness');
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

  console.log(`✓ Initialized Laravel Harness V2`);
  console.log(`  Config: ${configPath}`);
  console.log(`  Profile detected: ${detection.profile}`);
  detection.hints.forEach((h) => console.log(`    • ${h}`));
  console.log('\n  Next: run "lh doctor" to verify your environment.');
}
