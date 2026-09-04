import type { AgentProvider } from '../types.js';
import type { CompressionProvider, CompressionRequest, CompressionResult } from './compression-provider.js';
import { TokenCounter } from '../tokenization/token-counter.js';

export class NativeCompressionProvider implements CompressionProvider {
  public readonly name = 'native';
  private agentProvider: AgentProvider;

  constructor(agentProvider: AgentProvider) {
    this.agentProvider = agentProvider;
  }

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async compress(request: CompressionRequest): Promise<CompressionResult> {
    const text = request.document.content;
    const originalTokens = TokenCounter.countTokens(text);

    // If it's a fake/test run, let's do a deterministic compression fake
    if (this.agentProvider.constructor.name === 'FakeProvider') {
      const compressedContent = this.fakeCompress(request);
      const compressedTokens = TokenCounter.countTokens(compressedContent);
      return {
        status: 'compressed',
        content: compressedContent,
        provider: 'native',
        originalTokens,
        compressedTokens,
        diagnostics: ['Deterministic fake compression applied successfully'],
      };
    }

    try {
      const systemPrompt = `You are a context compression engine. Your task is to compress the provided markdown document to reduce its token usage by at least 30%, while strictly preserving all critical content.

CRITICAL PRESERVATION REQUIREMENTS:
- Keep ALL fenced code blocks (lines starting with \`\`\`) and inline code (between \`\`) EXACTLY verbatim. Do not alter any code.
- Keep ALL headings (lines starting with #, ##, ###) verbatim.
- Keep ALL URLs, absolute/relative paths, commands, environment variables, numbers, dates, and versions verbatim.
- Keep ALL acceptance criteria and security rules verbatim.

COMPRESSION INSTRUCTIONS:
- Remove redundant words, verbose explanations, duplicate sentences, or conversational filler.
- Condense paragraph text into bullet points or shorter sentences.
- Make the document as short and dense as possible without losing the original meaning or any protected sections.

Compression aggressiveness level requested: ${request.mode}`;

      const userMessage = `Document to compress:\n\n${text}`;

      const agentResult = await this.agentProvider.execute({
        stage: 'planning',
        runId: 'compression-run',
        attempt: 1,
        systemPrompt,
        userMessage,
        contextFiles: [],
      });

      if (agentResult.status === 'success' && agentResult.content) {
        const compressedContent = agentResult.content;
        const compressedTokens = TokenCounter.countTokens(compressedContent);

        return {
          status: 'compressed',
          content: compressedContent,
          provider: 'native',
          originalTokens,
          compressedTokens,
          diagnostics: [],
          usage: {
            inputTokens: agentResult.usage?.inputTokens ?? TokenCounter.countTokens(`${systemPrompt}\n${userMessage}`),
            outputTokens: agentResult.usage?.outputTokens ?? compressedTokens,
            measurementBasis: agentResult.usage ? 'provider_reported' : 'estimate',
          },
        };
      }

      return {
        status: 'failed',
        content: text,
        provider: 'native',
        originalTokens,
        compressedTokens: originalTokens,
        diagnostics: [`LLM compression failed: ${agentResult.content || 'Unknown error'}`],
        usage: {
          inputTokens: agentResult.usage?.inputTokens ?? TokenCounter.countTokens(`${systemPrompt}\n${userMessage}`),
          outputTokens: agentResult.usage?.outputTokens ?? TokenCounter.countTokens(agentResult.content ?? ''),
          measurementBasis: agentResult.usage ? 'provider_reported' : 'estimate',
        },
      };
    } catch (e: any) {
      return {
        status: 'failed',
        content: text,
        provider: 'native',
        originalTokens,
        compressedTokens: originalTokens,
        diagnostics: [`LLM compression error: ${e.message}`],
      };
    }
  }

  private fakeCompress(request: CompressionRequest): string {
    const text = request.document.content;
    const lines = text.split('\n');
    const shortenedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed.startsWith('`') || trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]')) {
        return line;
      }
      if (trimmed.length > 50) {
        return line.slice(0, Math.floor(line.length * 0.6)) + ' [compressed]';
      }
      return line;
    });

    return shortenedLines.join('\n');
  }
}
