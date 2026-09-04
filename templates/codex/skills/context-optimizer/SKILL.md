# Context Optimizer Skill

This skill allows the agent to automatically optimize, compress, and deduplicate context files (rules, plans, reports, logs) when prompt context grows large. This reduces token usage while maintaining safety and precision.

## Triggers

- Prompt size or context file token count exceeds a reasonable limit (e.g., 5,000 tokens).
- Redundant rules, global guidelines, or repetitious reports are loaded.
- Large test outputs or logs are loaded that contain excess noise.

## How it works

When enabled, Largentic coordinates a context optimization pipeline that:
1. **Scans & Classifies**: Determines document types and applies light, standard, or aggressive compression.
2. **Span Protection**: Verbatim extraction and preservation of code blocks, URLs, file paths, and commands.
3. **LLM Compression**: Condenses verbose prose and redundant instructions by 30%+.
4. **Validation**: Employs structural checks and negation audits to guarantee no critical constraints are lost.
5. **Deduplication**: Filters out duplicate instructions across multiple context files.

## Developer Commands

You can interact with context optimization manually using these terminal commands:

- `lh context inspect`: Scan the workspace and review original token counts, assigned policies, and treatment levels for all candidate files.
- `lh context status`: Show cache hit rates, total tokens saved, and fallback metrics.
- `lh context clear`: Clear the context cache.
