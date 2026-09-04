import type { AgentProvider } from '../types.js';
import type { ContextDocument } from '../context/types.js';
import { TokenCounter } from '../tokenization/token-counter.js';

export interface SemanticGradeResult {
  score: number;
  reasoning: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    measurementBasis: 'provider_reported' | 'estimate';
  };
}

export class SemanticGrader {
  private agentProvider: AgentProvider;

  constructor(agentProvider: AgentProvider) {
    this.agentProvider = agentProvider;
  }

  /**
   * Grade semantic equivalence of compressed content on a scale of 1 to 10
   */
  public async grade(original: ContextDocument, compressedContent: string): Promise<SemanticGradeResult> {
    if (this.agentProvider.constructor.name === 'FakeProvider') {
      return { score: 9, reasoning: 'Mock semantic grader approved' };
    }

    try {
      const systemPrompt = `You are an expert software engineering reviewer and semantic alignment inspector.
Your task is to compare an original markdown document with its compressed/optimized version.
You must grade the semantic equivalence and constraint-preservation on a scale from 1 to 10, where:
- 10: Absolutely perfect. No information, rules, constraints, numbers, variables, or code block elements were altered or lost.
- 8-9: Excellent. Verbose explanations were shortened, but all instructions, safety rules, and requirements are fully intact and accurate.
- <8: Information loss. A key requirement, command option, safety constraint, URL, variable, or code block was removed, altered, or compromised.

Your output must be a single line containing EXACTLY this JSON structure, and absolutely nothing else:
{"score": <number 1-10>, "reasoning": "<brief, 1-sentence explanation of changes/accuracy>"}`;

      const userMessage = `Original Document:
\`\`\`markdown
${original.content}
\`\`\`

Compressed Document:
\`\`\`markdown
${compressedContent}
\`\`\`

Return only the valid JSON response.`;

      const result = await this.agentProvider.execute({
        stage: 'planning',
        runId: 'semantic-grading-run',
        attempt: 1,
        systemPrompt,
        userMessage,
        contextFiles: [],
      });

      if (result.status === 'success' && result.content) {
        const match = result.content.match(/\{[\s\S]*?\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (typeof parsed.score === 'number') {
            return {
              score: parsed.score,
              reasoning: parsed.reasoning || 'No explanation provided',
              usage: {
                inputTokens: result.usage?.inputTokens ?? TokenCounter.countTokens(`${systemPrompt}\n${userMessage}`),
                outputTokens: result.usage?.outputTokens ?? TokenCounter.countTokens(result.content),
                measurementBasis: result.usage ? 'provider_reported' : 'estimate',
              },
            };
          }
        }
      }

      return {
        score: 7,
        reasoning: `Failed to parse semantic grader response: ${result.content}`,
        usage: {
          inputTokens: result.usage?.inputTokens ?? TokenCounter.countTokens(`${systemPrompt}\n${userMessage}`),
          outputTokens: result.usage?.outputTokens ?? TokenCounter.countTokens(result.content ?? ''),
          measurementBasis: result.usage ? 'provider_reported' : 'estimate',
        },
      };
    } catch (e: any) {
      return { score: 7, reasoning: `Semantic grading error: ${e.message}` };
    }
  }
}
