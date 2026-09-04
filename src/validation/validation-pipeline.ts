import type { ContextDocument, ProtectedSpan } from '../context/types.js';
import { ProtectedSpanExtractor } from '../compression/protected-span-extractor.js';
import { SemanticGrader } from './semantic-grader.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class ValidationPipeline {
  /**
   * Run standard and semantic validation gates asynchronously
   */
  public static async validateAsync(
    original: ContextDocument,
    compressedContent: string,
    minSavingsPercent: number = 20,
    semanticValidation: boolean = true,
    grader?: SemanticGrader
  ): Promise<ValidationResult> {
    const result = this.validate(original, compressedContent, minSavingsPercent);

    if (result.valid && semanticValidation && grader) {
      const gradeRes = await grader.grade(original, compressedContent);
      if (gradeRes.score < 8) {
        result.valid = false;
        result.errors.push(`Semantic grading score too low (${gradeRes.score}/10): ${gradeRes.reasoning}`);
      }
    }

    return result;
  }

  /**
   * Run validation gates on the compressed content against the original document
   */
  public static validate(
    original: ContextDocument,
    compressedContent: string,
    minSavingsPercent: number = 20
  ): ValidationResult {
    const errors: string[] = [];

    // 1. Minimum Savings Check
    const originalLen = original.content.length;
    const compressedLen = compressedContent.length;
    if (originalLen > 0) {
      const savingsPercent = ((originalLen - compressedLen) / originalLen) * 100;
      if (savingsPercent < minSavingsPercent && compressedLen < originalLen) {
        // Only reject if it did not meet savings AND is not unchanged.
        // Wait, if it is completely unchanged, we might want to accept it as 'unchanged' fallback, 
        // but if it mutated and saved less than minSavingsPercent, we should reject.
        errors.push(`Savings (${savingsPercent.toFixed(1)}%) did not meet minimum threshold (${minSavingsPercent}%)`);
      }
    }

    // 2. Headings Structural Check
    // All original headings must be preserved verbatim in the compressed output
    const originalSpans = ProtectedSpanExtractor.extract(original.content);
    const originalHeadings = originalSpans.filter((s) => s.type === 'heading');
    
    for (const heading of originalHeadings) {
      if (!compressedContent.includes(heading.text)) {
        errors.push(`Heading structural loss: Heading "${heading.text}" is missing from compressed content`);
      }
    }

    // 3. Protected Content/Spans Check
    // Critical items like fenced code blocks, paths, URLs, and commands must be preserved verbatim
    const criticalSpans = originalSpans.filter((s) => 
      s.type === 'code_block' || 
      s.type === 'url' || 
      s.type === 'path' || 
      s.type === 'command'
    );

    for (const span of criticalSpans) {
      if (!compressedContent.includes(span.text)) {
        errors.push(`Critical span loss: Protected element "${span.text}" of type "${span.type}" is missing or altered`);
      }
    }

    // 4. Negation and Safety constraints check
    // Ensure negative assertions (e.g. "must not", "never", "only", "do not") are not corrupted
    const negations = ['must not', 'never', 'only', 'do not', 'should not', 'cannot', 'will not'];
    for (const word of negations) {
      const originalCount = (original.content.match(new RegExp(`\\b${word}\\b`, 'gi')) || []).length;
      const compressedCount = (compressedContent.match(new RegExp(`\\b${word}\\b`, 'gi')) || []).length;
      if (originalCount > 0 && compressedCount < originalCount) {
        errors.push(`Constraint violation: safety negation keyword "${word}" frequency decreased (original: ${originalCount}, compressed: ${compressedCount})`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
