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

      const key = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (this.seenBlocks.has(key)) {
        return `_(Duplicate block omitted; referenced in previous rules/context)_`;
      }

      this.seenBlocks.add(key);
      return block;
    });

    return uniqueBlocks.join('\n\n');
  }

  /**
   * Static helper for batch deduplication
   */
  public static deduplicateBatch(contents: string[]): string[] {
    const dedup = new ContextDeduplicator();
    return contents.map((c) => dedup.deduplicateDocument(c));
  }
}
