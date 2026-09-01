import * as fs from 'fs';
import * as path from 'path';

export const REQUIRED_CODEX_FILES = [
  'config.toml',
  'global-rules.md',
  path.join('agents', 'planner.toml'),
  path.join('agents', 'implementer.toml'),
  path.join('agents', 'tester.toml'),
  path.join('agents', 'reviewer.toml'),
];

/**
 * Verify that the project has the Codex configuration required for native-agent
 * mode. Returns an actionable error message if any required file is missing,
 * or null when everything is present.
 */
export function getCodexProjectConfigError(cwd: string): string | null {
  const codexDir = path.join(cwd, '.codex');
  const missing: string[] = [];

  for (const relativePath of REQUIRED_CODEX_FILES) {
    const filePath = path.join(codexDir, relativePath);
    if (!fs.existsSync(filePath)) {
      missing.push(relativePath);
      continue;
    }

    try {
      fs.accessSync(filePath, fs.constants.R_OK);
    } catch {
      missing.push(relativePath);
    }
  }

  if (missing.length === 0) {
    return null;
  }

  const lines = [
    'Project-native Codex configuration is incomplete. The following required files are missing or unreadable:',
    ...missing.map((m) => `  - .codex/${m.replace(/\\/g, '/')}`),
    '',
    'Run "lh init" to deploy the default Codex setup, or create the files manually.',
  ];

  return lines.join('\n');
}
