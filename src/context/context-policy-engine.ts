import type { ContextOptimizationConfig } from '../types.js';
import type { ContextDocument, ContextDocumentType } from './types.js';

export type ContextOptimizationTreatment = 'exclude' | 'pass_through' | 'light' | 'standard' | 'aggressive';

export interface PolicyDecision {
  treatment: ContextOptimizationTreatment;
  reason: string;
}

export class ContextPolicyEngine {
  private config?: ContextOptimizationConfig;

  constructor(config?: ContextOptimizationConfig) {
    this.config = config;
  }

  /**
   * Determine the optimization policy decision for a context document
   */
  public getDecision(doc: ContextDocument): PolicyDecision {
    // 1. Check if context optimization is globally disabled
    if (this.config && !this.config.enabled) {
      return { treatment: 'pass_through', reason: 'Context optimization is globally disabled' };
    }

    // 2. Frontmatter overrides take first priority
    if (doc.frontmatter?.context?.compression) {
      const mode = doc.frontmatter.context.compression.toLowerCase();
      if (['exclude', 'pass_through', 'light', 'standard', 'aggressive'].includes(mode)) {
        return {
          treatment: mode as ContextOptimizationTreatment,
          reason: `Overridden by document frontmatter context.compression: ${mode}`,
        };
      }
    }

    // 3. Size-based exclusion
    if (this.config) {
      const sizeKb = doc.sizeBytes / 1024;
      if (sizeKb > this.config.maximum_file_size_kb) {
        return {
          treatment: 'pass_through',
          reason: `Document size (${sizeKb.toFixed(1)} KB) exceeds maximum allowed size (${this.config.maximum_file_size_kb} KB)`,
        };
      }
    }

    // 4. Exclude or pass through specific document types/locations
    if (doc.type === 'security_instructions') {
      return { treatment: 'pass_through', reason: 'Security instructions must be preserved verbatim' };
    }
    if (doc.type === 'source_code') {
      return { treatment: 'pass_through', reason: 'Source code must be preserved verbatim' };
    }
    if (doc.type === 'agent_config') {
      return { treatment: 'pass_through', reason: 'Agent config file must be preserved verbatim' };
    }
    if (doc.type === 'acceptance_criteria') {
      return { treatment: 'pass_through', reason: 'Acceptance criteria must be preserved verbatim' };
    }

    // 5. Default rules based on Document Type
    switch (doc.type) {
      case 'project_overview':
        return { treatment: 'aggressive', reason: 'Project overview is eligible for aggressive compression' };
      
      case 'architecture':
        return { treatment: 'standard', reason: 'Architecture explanation is eligible for standard compression' };

      case 'conventions':
        return { treatment: 'light', reason: 'Coding conventions/rules must be lightly compressed to protect constraints' };

      case 'active_plan':
        return { treatment: 'light', reason: 'Active implementation plan must be lightly compressed' };

      case 'implementation_report':
        return { treatment: 'standard', reason: 'Implementation reports use standard compression' };

      case 'test_output':
        return { treatment: 'standard', reason: 'Test output uses standard compression' };

      case 'review_report':
        return { treatment: 'standard', reason: 'Review reports use standard compression' };

      case 'error_logs':
        return { treatment: 'standard', reason: 'Error logs use standard compression' };

      default:
        // Use default mode from configuration if available
        const defaultMode = this.config?.mode || 'standard';
        return {
          treatment: defaultMode as ContextOptimizationTreatment,
          reason: `Defaulting to config mode: ${defaultMode}`,
        };
    }
  }
}
