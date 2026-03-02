/**
 * AI Service Types
 *
 * Type definitions for the AI Chat and LLM Runner system.
 */

/** Block context for AI requests */
export interface BlockContext {
  id: string;
  command: string;
  output: string;
  exitCode?: number;
  status: 'running' | 'success' | 'error';
  cwd?: string;
  startedAt: string;
  endedAt?: string;
}

/** Render mode for block context */
export type RenderMode = 'full' | 'errorOnly' | 'preview' | 'commandOnly';

/** Context specification for AI requests */
export interface ContextSpec {
  sessionId: string;
  blocks: string[];
  renderMode: RenderMode;
}

/** AI chat request */
export interface AIChatRequest {
  question: string;
  context: ContextSpec;
  runner?: RunnerName;
  conversationId?: string;
}

/** Citation in AI response */
export interface Citation {
  blockId: string;
  reason: string;
  excerpt?: string;
}

/** Risk level for suggested commands */
export type CommandRisk = 'safe' | 'caution' | 'dangerous';

/** Suggested next command */
export interface NextCommand {
  command: string;
  description: string;
  risk: CommandRisk;
}

/** AI chat response */
export interface AIChatResponse {
  runId: string;
  content: string;
  citations: Citation[];
  nextCommands: NextCommand[];
  cached: boolean;
  durationMs: number;
  runner: RunnerName;
  error?: string;
}

/** Runner names */
export type RunnerName = 'claude' | 'codex' | 'gemini' | 'auto' | 'disabled';

/** Runner availability status */
export interface RunnerStatus {
  name: RunnerName;
  available: boolean;
  authenticated: boolean;
  error?: string;
  version?: string;
}

/** Runner capabilities */
export interface RunnerCapabilities {
  supportsStreaming: boolean;
  supportsConversation: boolean;
  maxContextLength: number;
  supportedFeatures: string[];
}

/** Run request for runner */
export interface RunRequest {
  prompt: string;
  systemPrompt?: string;
  context: string;
  conversationId?: string;
  maxTokens?: number;
}

/** Run result from runner */
export interface RunResult {
  content: string;
  raw?: string;
  error?: string;
  durationMs: number;
  tokenCount?: {
    input: number;
    output: number;
  };
}

/** Streaming chunk from runner */
export interface RunChunk {
  type: 'content' | 'done' | 'error';
  content?: string;
  error?: string;
}

/** Block snapshot for AI run history */
export interface BlockSnapshot {
  id: string;
  command: string;
  outputPreview: string;
  exitCode?: number;
  status: 'running' | 'success' | 'error';
}

/** AI run record */
export interface AIRun {
  id: string;
  threadId: string;
  request: AIChatRequest;
  contextSnapshot: { blocks: BlockSnapshot[] };
  response: AIChatResponse;
  createdAt: string;
}

/** Thread of AI runs */
export interface AIThread {
  id: string;
  sessionId: string;
  runs: AIRun[];
  createdAt: string;
  updatedAt: string;
}
