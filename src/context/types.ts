import type { Stage } from '../types.js';

export type ContextDocumentType =
  | 'project_overview'
  | 'architecture'
  | 'conventions'
  | 'agent_instructions'
  | 'active_plan'
  | 'acceptance_criteria'
  | 'security_instructions'
  | 'implementation_report'
  | 'test_output'
  | 'review_report'
  | 'source_code'
  | 'agent_config'
  | 'error_logs'
  | 'other';

export interface ContextDocument {
  path: string; // absolute path
  relativePath: string; // relative to workspace
  content: string;
  hash: string; // SHA-256
  sizeBytes: number;
  type: ContextDocumentType;
  frontmatter?: Record<string, any>;
}

export interface ProtectedSpan {
  start: number;
  end: number;
  text: string;
  type: 'code_block' | 'inline_code' | 'url' | 'path' | 'command' | 'variable' | 'number' | 'heading' | 'constraint';
}

export type ContextOptimizationMeasurementBasis = 'provider_reported' | 'tokenizer' | 'estimate';

export interface ContextOptimizationMetrics {
  sourceTokens: number;
  deliveredTokens: number;
  grossTokensSaved: number;
  compressionInputTokens: number;
  compressionOutputTokens: number;
  validationInputTokens: number;
  validationOutputTokens: number;
  optimizationOverheadTokens: number;
  netTokensSaved: number;
  netSavingsPercent: number;
  cacheHits: number;
  cacheMisses: number;
  providerCalls: number;
  fallbacks: number;
  measurementBasis: ContextOptimizationMeasurementBasis;
  breakEvenUses: number;
  originalTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  savingsPercent: number;
}
