import type { ProtectedSpan } from '../context/types.js';

export class ProtectedSpanExtractor {
  /**
   * Scan text and extract all spans that must be protected during compression
   */
  public static extract(text: string): ProtectedSpan[] {
    const spans: ProtectedSpan[] = [];

    // Helper to add spans without overlapping
    const addSpan = (start: number, end: number, spanText: string, type: ProtectedSpan['type']) => {
      // Check if this span overlaps with any existing span
      const overlaps = spans.some((s) => (start >= s.start && start < s.end) || (end > s.start && end <= s.end));
      if (!overlaps) {
        spans.push({ start, end, text: spanText, type });
      }
    };

    // 1. Fenced Code Blocks (highest priority)
    const codeBlockRegex = /```[a-zA-Z0-9_-]*\r?\n[\s\S]*?```/g;
    let match: RegExpExecArray | null;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      addSpan(match.index, match.index + match[0].length, match[0], 'code_block');
    }

    // 2. Inline Code
    const inlineCodeRegex = /`[^`\r\n]+`/g;
    while ((match = inlineCodeRegex.exec(text)) !== null) {
      addSpan(match.index, match.index + match[0].length, match[0], 'inline_code');
    }

    // 3. Headings
    const headingRegex = /^#+\s+.*$/gm;
    while ((match = headingRegex.exec(text)) !== null) {
      addSpan(match.index, match.index + match[0].length, match[0], 'heading');
    }

    // 4. URLs
    const urlRegex = /https?:\/\/[^\s\)\],]+/g;
    while ((match = urlRegex.exec(text)) !== null) {
      addSpan(match.index, match.index + match[0].length, match[0], 'url');
    }

    // 5. File Paths (absolute, relative, or with specific extensions)
    const pathRegex = /(?:\/|[a-zA-Z0-9_\-]+\/)[a-zA-Z0-9_\-\.\/]+\.(?:php|ts|js|json|yml|yaml|md|sh|toml|lock|ico|png|txt|html)/g;
    while ((match = pathRegex.exec(text)) !== null) {
      addSpan(match.index, match.index + match[0].length, match[0], 'path');
    }

    // 6. Commands and Variables
    const commandRegex = /(?:vendor\/bin\/phpunit|php\s+artisan|npm\s+run|composer\s+require|git\s+[a-z]+)/g;
    while ((match = commandRegex.exec(text)) !== null) {
      addSpan(match.index, match.index + match[0].length, match[0], 'command');
    }

    // Sort by start position
    return spans.sort((a, b) => a.start - b.start);
  }
}
