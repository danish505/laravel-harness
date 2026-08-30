import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import type { HarnessConfig } from '../types.js';

const CONFIG_DEFAULTS: HarnessConfig = {
  version: 2,
  profile: 'generic',
  workflow: {
    max_attempts: 3,
    plan_approval: 'required',
    review_approval: 'automatic',
  },
  agents: {},
  quality_gates: {
    require_tests: true,
    require_clean_secrets_scan: true,
    max_changed_files: 25,
  },
  budget: {
    max_runtime_minutes: 45,
    max_estimated_cost_usd: 10,
  },
  provider: 'codex',
};

const ajv = new Ajv({ allErrors: true, useDefaults: true });
addFormats(ajv);

let _validate: ReturnType<typeof ajv.compile> | null = null;

function getValidator() {
  if (!_validate) {
    const schemaPath = path.resolve(__dirname, '../../schemas/config.schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    _validate = ajv.compile(schema);
  }
  return _validate;
}

export interface ConfigLoadResult {
  config: HarnessConfig;
  errors: string[];
  valid: boolean;
}

export function loadConfig(configPath: string): ConfigLoadResult {
  if (!fs.existsSync(configPath)) {
    return {
      config: applyEnvOverrides(structuredClone(CONFIG_DEFAULTS)),
      errors: [`Config file not found: ${configPath}. Run 'lh init' to create one.`],
      valid: false,
    };
  }

  let raw: unknown;
  try {
    raw = yaml.load(fs.readFileSync(configPath, 'utf8'));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      config: applyEnvOverrides(structuredClone(CONFIG_DEFAULTS)),
      errors: [`Failed to parse config YAML: ${msg}`],
      valid: false,
    };
  }

  const validate = getValidator();
  const merged = deepMerge(
    structuredClone(CONFIG_DEFAULTS) as unknown as Record<string, unknown>,
    raw as Record<string, unknown>
  );

  const valid = validate(merged);
  const errors: string[] = valid
    ? []
    : (validate.errors ?? []).map(
        (e) => `  ${e.instancePath || '(root)'}: ${e.message}`
      );

  return {
    config: applyEnvOverrides(merged as unknown as HarnessConfig),
    errors,
    valid: !!valid,
  };
}

function applyEnvOverrides(config: HarnessConfig): HarnessConfig {
  if (process.env.LH_PROVIDER) {
    config.provider = process.env.LH_PROVIDER as HarnessConfig['provider'];
  }
  if (process.env.LH_MAX_ATTEMPTS) {
    config.workflow.max_attempts = parseInt(process.env.LH_MAX_ATTEMPTS, 10);
  }
  if (process.env.LH_PROFILE) {
    config.profile = process.env.LH_PROFILE as HarnessConfig['profile'];
  }
  return config;
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (
      sv !== null &&
      typeof sv === 'object' &&
      !Array.isArray(sv) &&
      tv !== null &&
      typeof tv === 'object' &&
      !Array.isArray(tv)
    ) {
      result[key] = deepMerge(
        tv as Record<string, unknown>,
        sv as Record<string, unknown>
      );
    } else if (sv !== undefined) {
      result[key] = sv;
    }
  }
  return result;
}

export function findConfigPath(cwd: string): string {
  return path.join(cwd, '.laravel-harness', 'config.yaml');
}
