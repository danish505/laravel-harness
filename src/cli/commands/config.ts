import { loadConfig, findConfigPath } from '../../config/loader.js';
import * as yaml from 'js-yaml';

export function configValidateCommand(cwd: string): void {
  const configPath = findConfigPath(cwd);
  const { valid, errors, config } = loadConfig(configPath);

  if (valid) {
    console.log(`✅ Config is valid: ${configPath}`);
    console.log(`   Profile: ${config.profile}`);
    console.log(`   Provider: ${config.provider}`);
    console.log(`   Max attempts: ${config.workflow.max_attempts}`);
    console.log(`   Plan approval: ${config.workflow.plan_approval}`);
  } else {
    console.error(`❌ Config is invalid: ${configPath}`);
    errors.forEach((e) => console.error(e));
    process.exitCode = 1;
  }
}

export function configShowCommand(cwd: string): void {
  const configPath = findConfigPath(cwd);
  const { config, valid, errors } = loadConfig(configPath);

  if (!valid) {
    console.warn('⚠️  Config has errors (showing merged defaults):\n' + errors.join('\n'));
  }
  console.log(yaml.dump(config, { indent: 2 }));
}
