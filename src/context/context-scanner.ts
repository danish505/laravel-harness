import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as yaml from 'js-yaml';
import type { ContextDocument, ContextDocumentType } from './types.js';

export class ContextScanner {
  private cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  /**
   * Scan and load a context file by absolute or relative path
   */
  public loadFile(filePath: string, forcedType?: ContextDocumentType): ContextDocument | null {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(this.cwd, filePath);
    if (!fs.existsSync(absolutePath)) {
      return null;
    }

    try {
      const stats = fs.statSync(absolutePath);
      if (!stats.isFile()) {
        return null;
      }

      const relativePath = path.relative(this.cwd, absolutePath);
      const content = fs.readFileSync(absolutePath, 'utf8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');

      // Parse frontmatter
      const { frontmatter, body } = this.parseMarkdown(content);
      const type = forcedType || this.classify(relativePath, body, frontmatter);

      return {
        path: absolutePath,
        relativePath,
        content,
        hash,
        sizeBytes: stats.size,
        type,
        frontmatter,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Scan multiple files
   */
  public scan(filePaths: string[]): ContextDocument[] {
    const docs: ContextDocument[] = [];
    for (const fp of filePaths) {
      const doc = this.loadFile(fp);
      if (doc) {
        docs.push(doc);
      }
    }
    return docs;
  }

  /**
   * Determine document type based on path, content, and frontmatter
   */
  private classify(
    relativePath: string,
    body: string,
    frontmatter?: Record<string, any>
  ): ContextDocumentType {
    if (frontmatter?.context?.type) {
      return frontmatter.context.type as ContextDocumentType;
    }

    const lowerPath = relativePath.toLowerCase();
    const baseName = path.basename(lowerPath);

    // Agent config TOMLs
    if (lowerPath.includes('.codex/agents') && baseName.endsWith('.toml')) {
      return 'agent_config';
    }

    // Global rules or general conventions
    if (baseName === 'global-rules.md' || baseName === 'agents.md') {
      return 'conventions';
    }

    // Stage artifacts
    if (baseName === 'plan.md') {
      return 'active_plan';
    }
    if (baseName === 'implementation.md') {
      return 'implementation_report';
    }
    if (baseName === 'test-results.md') {
      return 'test_output';
    }
    if (baseName === 'review.md') {
      return 'review_report';
    }

    // Common documentation naming conventions
    if (lowerPath.includes('architecture') || baseName.includes('architecture')) {
      return 'architecture';
    }
    if (lowerPath.includes('overview') || baseName.includes('overview')) {
      return 'project_overview';
    }
    if (lowerPath.includes('convention') || baseName.includes('convention') || lowerPath.includes('style_guide')) {
      return 'conventions';
    }
    if (lowerPath.includes('security') || baseName.includes('security')) {
      return 'security_instructions';
    }

    // Fallbacks
    return 'other';
  }

  /**
   * Simple frontmatter parser
   */
  private parseMarkdown(content: string): { frontmatter?: Record<string, any>; body: string } {
    const match = content.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n/);
    if (match) {
      const yamlStr = match[1];
      const body = content.slice(match[0].length);
      try {
        const parsed = yaml.load(yamlStr);
        if (parsed && typeof parsed === 'object') {
          return { frontmatter: parsed as Record<string, any>, body };
        }
      } catch {
        // Suppress parsing errors, return unparsed
      }
    }
    return { body: content };
  }
}
