import * as fs from 'fs';
import * as path from 'path';

export interface DetectionResult {
  profile: 'laravel' | 'generic';
  projectRoot: string;
  hints: string[];
}

export function detectProfile(cwd: string): DetectionResult {
  const hints: string[] = [];

  const artisan = path.join(cwd, 'artisan');
  const composerJson = path.join(cwd, 'composer.json');

  if (fs.existsSync(artisan)) {
    hints.push('Found artisan binary → Laravel project');
    return { profile: 'laravel', projectRoot: cwd, hints };
  }

  if (fs.existsSync(composerJson)) {
    try {
      const composer = JSON.parse(fs.readFileSync(composerJson, 'utf8')) as {
        require?: Record<string, string>;
      };
      if (composer.require?.['laravel/framework']) {
        hints.push('Found laravel/framework in composer.json → Laravel project');
        return { profile: 'laravel', projectRoot: cwd, hints };
      }
      hints.push('Found composer.json without laravel/framework → generic PHP project');
    } catch {
      hints.push('Found composer.json (unparseable) → generic profile');
    }
  }

  hints.push('No Laravel indicators found → generic profile');
  return { profile: 'generic', projectRoot: cwd, hints };
}
