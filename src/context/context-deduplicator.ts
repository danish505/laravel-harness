import * as crypto from 'crypto';

export class ContextDeduplicator {
  private seenBlocks = new Set<string>();

  /**
   * Deduplicate a single document's blocks against already-seen blocks
   */
  public deduplicateDocument(content: string): string {
    const blocks = content.split(/\r?\n\r?\n/);
    const uniqueBlocks = blocks.map((block) => {
      const trimmed = block.trim();
      // Skip short lines, headings, list items with checkboxes, or code blocks
      if (
        trimmed.length < 60 ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('- [ ]') ||
        trimmed.startsWith('- [x]') ||
        trimmed.startsWith('```')
      ) {
        return block;
      }

      const key = this.hashBlock(trimmed);
      if (this.seenBlocks.has(key)) {
        return '';
      }

      this.seenBlocks.add(key);
      return block;
    });

    return uniqueBlocks.filter((block) => block !== '').join('\n\n');
  }

  public snapshot(): Set<string> {
    return new Set(this.seenBlocks);
  }

  public restore(snapshot: Set<string>): void {
    this.seenBlocks = new Set(snapshot);
  }

  private hashBlock(block: string): string {
    const normalized = block.replace(/\r\n/g, '\n').trim();
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Static helper for batch deduplication
   */
  public static deduplicateBatch(contents: string[]): string[] {
    const dedup = new ContextDeduplicator();
    return contents.map((c) => dedup.deduplicateDocument(c));
  }
}
