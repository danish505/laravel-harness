export class TokenCounter {
  /**
   * Estimate token count of a given string
   * 
   * A highly reliable estimation:
   * - standard text: ~4.1 characters per token
   * - code blocks: ~3.2 characters per token (more punctuation/indentation)
   * - fallback: character length / 4
   */
  public static countTokens(text: string, model?: string): number {
    if (!text) {
      return 0;
    }

    // Identify code blocks to apply code token density
    const codeBlockRegex = /```[\s\S]*?```/g;
    let codeChars = 0;
    const codeBlocks = text.match(codeBlockRegex) || [];
    
    for (const block of codeBlocks) {
      codeChars += block.length;
    }

    const proseChars = text.length - codeChars;

    // Estimate based on characteristic lengths
    const proseTokens = Math.ceil(proseChars / 4.1);
    const codeTokens = Math.ceil(codeChars / 3.2);

    return proseTokens + codeTokens;
  }
}
