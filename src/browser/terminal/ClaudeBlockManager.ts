/**
 * ClaudeBlockManager - Manages Claude Code conversation turns
 *
 * Handles WebSocket messages from ClaudeSessionWatcher and organizes
 * them into conversation turns for display.
 */

export interface ClaudeToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
  isError: boolean;
  status: 'pending' | 'complete' | 'error';
}

export interface ClaudeTurn {
  id: string;
  type: 'claude';
  sessionId: string;
  userMessage: string;
  assistantText: string;
  thinking?: string;
  toolCalls: ClaudeToolCall[];
  timestamp: string;
  status: 'streaming' | 'complete';
  startLine?: number;
  endLine?: number;
}

export interface ClaudeBlockManagerOptions {
  onTurnStart?: (turn: ClaudeTurn) => void;
  onTurnUpdate?: (turn: ClaudeTurn) => void;
  onTurnComplete?: (turn: ClaudeTurn) => void;
  onSessionStart?: (sessionId: string) => void;
  onSessionEnd?: (sessionId: string) => void;
}

// Message types from server
interface ClaudeUserMessageWS {
  type: 'claudeUserMessage';
  uuid: string;
  content: string;
  timestamp: string;
  sessionId: string;
}

interface ClaudeAssistantTextWS {
  type: 'claudeAssistantText';
  uuid: string;
  text: string;
  timestamp: string;
}

interface ClaudeThinkingWS {
  type: 'claudeThinking';
  uuid: string;
  thinking: string;
  timestamp: string;
}

interface ClaudeToolUseWS {
  type: 'claudeToolUse';
  uuid: string;
  toolId: string;
  toolName: string;
  input: Record<string, unknown>;
  timestamp: string;
}

interface ClaudeToolResultWS {
  type: 'claudeToolResult';
  uuid: string;
  toolId: string;
  content: string;
  isError: boolean;
  timestamp: string;
}

interface ClaudeSessionStartWS {
  type: 'claudeSessionStart';
  sessionId: string;
  project: string;
  timestamp: string;
}

interface ClaudeSessionEndWS {
  type: 'claudeSessionEnd';
  sessionId: string;
  timestamp: string;
}

type ClaudeMessage =
  | ClaudeUserMessageWS
  | ClaudeAssistantTextWS
  | ClaudeThinkingWS
  | ClaudeToolUseWS
  | ClaudeToolResultWS
  | ClaudeSessionStartWS
  | ClaudeSessionEndWS;

export class ClaudeBlockManager {
  private turns: Map<string, ClaudeTurn> = new Map();
  private turnOrder: string[] = [];
  private currentTurnId: string | null = null;
  private currentSessionId: string | null = null;
  private options: ClaudeBlockManagerOptions;

  constructor(options: ClaudeBlockManagerOptions = {}) {
    this.options = options;
  }

  /**
   * Handle incoming Claude message
   */
  handleMessage(message: ClaudeMessage): void {
    switch (message.type) {
      case 'claudeSessionStart':
        this.handleSessionStart(message);
        break;

      case 'claudeSessionEnd':
        this.handleSessionEnd(message);
        break;

      case 'claudeUserMessage':
        this.handleUserMessage(message);
        break;

      case 'claudeAssistantText':
        this.handleAssistantText(message);
        break;

      case 'claudeThinking':
        this.handleThinking(message);
        break;

      case 'claudeToolUse':
        this.handleToolUse(message);
        break;

      case 'claudeToolResult':
        this.handleToolResult(message);
        break;
    }
  }

  /**
   * Handle session start
   */
  private handleSessionStart(message: ClaudeSessionStartWS): void {
    this.currentSessionId = message.sessionId;
    this.options.onSessionStart?.(message.sessionId);
  }

  /**
   * Handle session end
   */
  private handleSessionEnd(message: ClaudeSessionEndWS): void {
    // Complete current turn if any
    if (this.currentTurnId) {
      const turn = this.turns.get(this.currentTurnId);
      if (turn) {
        turn.status = 'complete';
        this.options.onTurnComplete?.(turn);
      }
      this.currentTurnId = null;
    }

    this.options.onSessionEnd?.(message.sessionId);
    this.currentSessionId = null;
  }

  /**
   * Handle user message - starts a new turn
   */
  private handleUserMessage(message: ClaudeUserMessageWS): void {
    // Complete previous turn if any
    if (this.currentTurnId) {
      const prevTurn = this.turns.get(this.currentTurnId);
      if (prevTurn && prevTurn.status === 'streaming') {
        prevTurn.status = 'complete';
        this.options.onTurnComplete?.(prevTurn);
      }
    }

    // Create new turn
    const turn: ClaudeTurn = {
      id: message.uuid,
      type: 'claude',
      sessionId: message.sessionId,
      userMessage: message.content,
      assistantText: '',
      toolCalls: [],
      timestamp: message.timestamp,
      status: 'streaming'
    };

    this.turns.set(turn.id, turn);
    this.turnOrder.push(turn.id);
    this.currentTurnId = turn.id;

    this.options.onTurnStart?.(turn);
  }

  /**
   * Handle assistant text response
   */
  private handleAssistantText(message: ClaudeAssistantTextWS): void {
    const turn = this.currentTurnId ? this.turns.get(this.currentTurnId) : null;
    if (!turn) return;

    // Append text (streaming)
    turn.assistantText += message.text;
    this.options.onTurnUpdate?.(turn);
  }

  /**
   * Handle thinking block
   */
  private handleThinking(message: ClaudeThinkingWS): void {
    const turn = this.currentTurnId ? this.turns.get(this.currentTurnId) : null;
    if (!turn) return;

    // Store thinking (usually replace, not append)
    turn.thinking = message.thinking;
    this.options.onTurnUpdate?.(turn);
  }

  /**
   * Handle tool use
   */
  private handleToolUse(message: ClaudeToolUseWS): void {
    const turn = this.currentTurnId ? this.turns.get(this.currentTurnId) : null;
    if (!turn) return;

    const toolCall: ClaudeToolCall = {
      id: message.toolId,
      name: message.toolName,
      input: message.input,
      isError: false,
      status: 'pending'
    };

    turn.toolCalls.push(toolCall);
    this.options.onTurnUpdate?.(turn);
  }

  /**
   * Handle tool result
   */
  private handleToolResult(message: ClaudeToolResultWS): void {
    const turn = this.currentTurnId ? this.turns.get(this.currentTurnId) : null;
    if (!turn) return;

    // Find matching tool call
    const toolCall = turn.toolCalls.find((tc) => tc.id === message.toolId);
    if (toolCall) {
      toolCall.result = message.content;
      toolCall.isError = message.isError;
      toolCall.status = message.isError ? 'error' : 'complete';
      this.options.onTurnUpdate?.(turn);
    }
  }

  /**
   * Get all turns
   */
  getAllTurns(): ClaudeTurn[] {
    return this.turnOrder.map((id) => this.turns.get(id)!).filter(Boolean);
  }

  /**
   * Get turn by ID
   */
  getTurn(id: string): ClaudeTurn | undefined {
    return this.turns.get(id);
  }

  /**
   * Get current (active) turn
   */
  getCurrentTurn(): ClaudeTurn | null {
    return this.currentTurnId ? (this.turns.get(this.currentTurnId) ?? null) : null;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Get turn count
   */
  get count(): number {
    return this.turns.size;
  }

  /**
   * Clear all turns
   */
  clear(): void {
    this.turns.clear();
    this.turnOrder = [];
    this.currentTurnId = null;
  }

  /**
   * Mark current turn as complete
   */
  completeCurrentTurn(): void {
    if (!this.currentTurnId) return;

    const turn = this.turns.get(this.currentTurnId);
    if (turn) {
      turn.status = 'complete';
      this.options.onTurnComplete?.(turn);
    }
  }

  /**
   * Get formatted turn content for copying
   */
  formatTurnForCopy(turnId: string): string {
    const turn = this.turns.get(turnId);
    if (!turn) return '';

    const lines: string[] = [];
    lines.push(`User: ${turn.userMessage}`);
    lines.push('');

    if (turn.assistantText) {
      lines.push(`Assistant: ${turn.assistantText}`);
    }

    if (turn.toolCalls.length > 0) {
      lines.push('');
      lines.push('Tool Calls:');
      for (const tc of turn.toolCalls) {
        const status = tc.status === 'complete' ? '✓' : tc.status === 'error' ? '✗' : '...';
        lines.push(`  ${status} ${tc.name}: ${JSON.stringify(tc.input).slice(0, 100)}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get formatted turn content as Markdown
   */
  formatTurnAsMarkdown(turnId: string): string {
    const turn = this.turns.get(turnId);
    if (!turn) return '';

    const lines: string[] = [];
    lines.push(`## User`);
    lines.push(turn.userMessage);
    lines.push('');

    if (turn.assistantText) {
      lines.push(`## Assistant`);
      lines.push(turn.assistantText);
    }

    if (turn.toolCalls.length > 0) {
      lines.push('');
      lines.push('## Tool Calls');
      for (const tc of turn.toolCalls) {
        const status = tc.status === 'complete' ? '✅' : tc.status === 'error' ? '❌' : '⏳';
        lines.push(`### ${status} ${tc.name}`);
        lines.push('```json');
        lines.push(JSON.stringify(tc.input, null, 2));
        lines.push('```');
        if (tc.result) {
          lines.push('Result:');
          lines.push('```');
          lines.push(tc.result.slice(0, 500));
          if (tc.result.length > 500) {
            lines.push('... (truncated)');
          }
          lines.push('```');
        }
      }
    }

    return lines.join('\n');
  }
}

export default ClaudeBlockManager;
