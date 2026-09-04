import type { ContextDocument, ProtectedSpan } from '../context/types.js';

export interface CompressionRequest {
  document: ContextDocument;
  mode: 'light' | 'standard' | 'aggressive';
  protectedSpans: ProtectedSpan[];
  signal?: AbortSignal;
}

export interface CompressionResult {
  status: 'compressed' | 'unchanged' | 'failed';
  content: string;
  provider: 'native' | 'caveman' | 'fake';
  originalTokens: number;
  compressedTokens: number;
  diagnostics: string[];
}

export interface CompressionProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  compress(request: CompressionRequest): Promise<CompressionResult>;
}
