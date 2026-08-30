export type Stage = 'planning' | 'implementing' | 'testing' | 'reviewing';

export type RunStatus =
  | 'created'
  | 'planning'
  | 'awaiting_plan_approval'
  | 'implementing'
  | 'testing'
  | 'testing_failed'
  | 'reviewing'
  | 'review_rejected'
  | 'approved'
  | 'cancelled'
  | 'failed'
  | 'blocked';

export type FailureClassification =
  | 'test_failure'
  | 'review_rejection'
  | 'infrastructure'
  | 'timeout'
  | 'budget_exceeded'
  | 'invalid_output'
  | null;

export interface RunState {
  schema_version: '2.0';
  run_id: string;
  status: RunStatus;
  attempt: number;
  created_at: string;
  updated_at: string;
  failure_reason?: string;
  transition_actor?: string;
}

export interface RunManifest {
  schema_version: '2.0';
  run_id: string;
  task: string;
  profile: string;
  provider: string;
  created_at: string;
  cwd: string;
  git_branch?: string;
  git_commit?: string;
}

export interface StageResult {
  schema_version: '2.0';
  run_id: string;
  attempt: number;
  stage: Stage;
  status: 'success' | 'failure' | 'blocked';
  agent_id: string;
  provider: string;
  input_hashes: Record<string, string>;
  output_files: string[];
  summary: string;
  content: string;
  next_action: string;
  failure_classification: FailureClassification;
  failure_details?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
  };
  started_at: string;
  completed_at: string;
}

export interface HarnessConfig {
  version: 2;
  profile: 'laravel' | 'generic';
  workflow: {
    max_attempts: number;
    plan_approval: 'required' | 'automatic';
    review_approval: 'required' | 'automatic';
  };
  agents: {
    planner?: AgentConfig;
    implementer?: AgentConfig;
    tester?: AgentConfig;
    reviewer?: AgentConfig;
  };
  quality_gates: {
    require_tests: boolean;
    require_clean_secrets_scan: boolean;
    max_changed_files: number;
    test_command?: string;
    build_command?: string;
  };
  budget: {
    max_runtime_minutes: number;
    max_estimated_cost_usd: number;
  };
  provider: 'codex' | 'fake';
}

export interface AgentConfig {
  provider?: 'codex' | 'fake';
  reasoning?: 'low' | 'medium' | 'high';
  system_prompt_override?: string;
}

export interface AgentRequest {
  stage: Stage;
  runId: string;
  attempt: number;
  systemPrompt: string;
  userMessage: string;
  contextFiles: ContextFile[];
}

export interface AgentResult {
  status: 'success' | 'failure' | 'blocked';
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
  failureClassification?: FailureClassification;
  rawOutput?: string;
}

export interface ContextFile {
  path: string;
  content: string;
}

export interface GateResult {
  gate: string;
  passed: boolean;
  blocking: boolean;
  message: string;
}

export type ApprovalDecision = 'approved' | 'rejected' | 'cancelled';

export interface AgentProvider {
  execute(request: AgentRequest): Promise<AgentResult>;
}
