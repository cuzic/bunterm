/**
 * Chat Store (Zustand)
 *
 * State management for AI chat with WebSocket streaming support.
 * Includes:
 * - Sec-WebSocket-Protocol token authentication
 * - ai_stream + ai_final gap compensation
 * - Sequence gap detection and recovery
 */

import type {
  AIChatResponse,
  Citation,
  FileSource,
  NextCommand,
  RunnerName,
  RunnerStatus
} from '@/daemon/native-terminal/ai/types.js';
import {
  getAllBlockContents,
  removeBlockContent
} from '@/daemon/native-terminal/client/app/hooks/useBlockContextBridge.js';
import { create } from 'zustand';

/** File reference for context */
export interface ContextFileRef {
  source: FileSource;
  path: string;
  name: string;
  size: number;
  modifiedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  citations?: Citation[];
  nextCommands?: NextCommand[];
  runId?: string;
  error?: string;
  /** Whether this message is still streaming */
  isStreaming?: boolean;
  /** Whether a sequence gap was detected during streaming */
  hasGap?: boolean;
}

/** State for tracking a streaming AI run */
interface StreamingRunState {
  runId: string;
  messageId: string;
  content: string;
  expectedSeq: number;
  gapDetected: boolean;
}

/** Maximum number of context files */
const MAX_CONTEXT_FILES = 5;

export interface ChatStoreState {
  // Messages
  messages: ChatMessage[];
  isLoading: boolean;

  // Runner state
  selectedRunner: RunnerName;
  availableRunners: RunnerStatus[];

  // Context - blocks
  contextBlockIds: string[];

  // Context - files
  contextFiles: ContextFileRef[];

  // Thread
  threadId: string | null;

  // UI state
  isOpen: boolean;
  inputValue: string;

  // WebSocket streaming
  wsToken: string | null;
  wsConnection: WebSocket | null;
  streamingRun: StreamingRunState | null;

  // Actions
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;

  setSelectedRunner: (runner: RunnerName) => void;
  setAvailableRunners: (runners: RunnerStatus[]) => void;

  addContextBlock: (blockId: string) => void;
  removeContextBlock: (blockId: string) => void;
  clearContextBlocks: () => void;
  setContextBlocks: (blockIds: string[]) => void;

  // File context actions
  addContextFile: (file: ContextFileRef) => void;
  removeContextFile: (source: FileSource, path: string) => void;
  clearContextFiles: () => void;

  setThreadId: (threadId: string | null) => void;

  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setInputValue: (value: string) => void;

  // WebSocket actions
  fetchWsToken: (sessionId: string) => Promise<string | null>;
  connectWebSocket: (sessionId: string) => Promise<void>;
  disconnectWebSocket: () => void;
  handleAIStream: (data: AIStreamData) => void;
  handleAIFinal: (data: AIFinalData) => void;
  handleAIError: (data: AIErrorData) => void;

  // Async actions
  sendMessage: (question: string, sessionId: string) => Promise<void>;
  sendMessageViaWebSocket: (question: string, sessionId: string) => Promise<void>;
  fetchRunners: () => Promise<void>;
}

// WebSocket message types
interface AIStreamData {
  type: 'ai_stream';
  runId: string;
  seq: number;
  delta: string;
}

interface AIFinalData {
  type: 'ai_final';
  runId: string;
  result: {
    content: string;
    citations: Citation[];
    nextCommands: NextCommand[];
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  elapsedMs: number;
}

interface AIErrorData {
  type: 'ai_error';
  runId: string;
  error: string;
  code: string;
}

// API base path
const getApiBasePath = (): string => {
  const config = (window as unknown as { __TERMINAL_UI_CONFIG__?: { base_path?: string } })
    .__TERMINAL_UI_CONFIG__;
  return config?.base_path ?? '/bunterm';
};

// Build WebSocket URL
const getWsUrl = (sessionId: string): string => {
  const basePath = getApiBasePath();
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${basePath}/${sessionId}/ws`;
};

export const useChatStore = create<ChatStoreState>((set, get) => ({
  // Initial state
  messages: [],
  isLoading: false,
  selectedRunner: 'auto',
  availableRunners: [],
  contextBlockIds: [],
  contextFiles: [],
  threadId: null,
  isOpen: false,
  inputValue: '',
  wsToken: null,
  wsConnection: null,
  streamingRun: null,

  // Message actions
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message]
    })),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m))
    })),

  clearMessages: () => set({ messages: [], threadId: null }),

  setLoading: (loading) => set({ isLoading: loading }),

  // Runner actions
  setSelectedRunner: (runner) => set({ selectedRunner: runner }),

  setAvailableRunners: (runners) => set({ availableRunners: runners }),

  // Context actions
  addContextBlock: (blockId) =>
    set((state) => {
      if (state.contextBlockIds.includes(blockId)) {
        return state;
      }
      return { contextBlockIds: [...state.contextBlockIds, blockId] };
    }),

  removeContextBlock: (blockId) => {
    // Also remove from block content registry
    removeBlockContent(blockId);
    return set((state) => ({
      contextBlockIds: state.contextBlockIds.filter((id) => id !== blockId)
    }));
  },

  clearContextBlocks: () => set({ contextBlockIds: [] }),

  setContextBlocks: (blockIds) => set({ contextBlockIds: blockIds }),

  // File context actions
  addContextFile: (file) =>
    set((state) => {
      // Check if file already exists
      const exists = state.contextFiles.some(
        (f) => f.source === file.source && f.path === file.path
      );
      if (exists) {
        return state;
      }
      // Check max limit
      if (state.contextFiles.length >= MAX_CONTEXT_FILES) {
        console.warn(`Maximum ${MAX_CONTEXT_FILES} files can be attached`);
        return state;
      }
      return { contextFiles: [...state.contextFiles, file] };
    }),

  removeContextFile: (source, path) =>
    set((state) => ({
      contextFiles: state.contextFiles.filter((f) => !(f.source === source && f.path === path))
    })),

  clearContextFiles: () => set({ contextFiles: [] }),

  // Thread actions
  setThreadId: (threadId) => set({ threadId }),

  // UI actions
  setOpen: (open) => set({ isOpen: open }),

  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),

  setInputValue: (value) => set({ inputValue: value }),

  // WebSocket actions
  fetchWsToken: async (sessionId: string): Promise<string | null> => {
    const basePath = getApiBasePath();
    try {
      const response = await fetch(`${basePath}/api/auth/ws-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });

      if (!response.ok) {
        console.error('Failed to fetch WebSocket token:', response.status);
        return null;
      }

      const data = (await response.json()) as { token: string };
      set({ wsToken: data.token });
      return data.token;
    } catch (error) {
      console.error('Failed to fetch WebSocket token:', error);
      return null;
    }
  },

  connectWebSocket: async (sessionId: string): Promise<void> => {
    const state = get();

    // Already connected
    if (state.wsConnection?.readyState === WebSocket.OPEN) {
      return;
    }

    // Get token for authentication
    const token = await get().fetchWsToken(sessionId);
    if (!token) {
      console.warn('WebSocket connection without token (auth may be disabled)');
    }

    const wsUrl = getWsUrl(sessionId);

    // Create WebSocket with Sec-WebSocket-Protocol for token auth
    const protocols = token ? [`bearer.${token}`] : undefined;
    const ws = new WebSocket(wsUrl, protocols);

    ws.onopen = () => {
      console.log('[ChatStore] WebSocket connected');
      set({ wsConnection: ws });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case 'ai_stream':
            get().handleAIStream(data as AIStreamData);
            break;
          case 'ai_final':
            get().handleAIFinal(data as AIFinalData);
            break;
          case 'ai_error':
            get().handleAIError(data as AIErrorData);
            break;
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[ChatStore] WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('[ChatStore] WebSocket disconnected');
      set({ wsConnection: null, wsToken: null });
    };
  },

  disconnectWebSocket: () => {
    const state = get();
    if (state.wsConnection) {
      state.wsConnection.close();
      set({ wsConnection: null, wsToken: null });
    }
  },

  /**
   * Handle ai_stream message - incremental content
   * May be dropped, use ai_final for recovery
   */
  handleAIStream: (data: AIStreamData) => {
    const state = get();
    let streamingRun = state.streamingRun;

    // Initialize streaming state if new run
    if (!streamingRun || streamingRun.runId !== data.runId) {
      const messageId = `msg_${Date.now()}_assistant`;

      // Add streaming message
      const streamingMessage: ChatMessage = {
        id: messageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        runId: data.runId,
        isStreaming: true
      };

      set((s) => ({
        messages: [...s.messages, streamingMessage],
        streamingRun: {
          runId: data.runId,
          messageId,
          content: '',
          expectedSeq: 0,
          gapDetected: false
        }
      }));

      streamingRun = get().streamingRun;
    }

    if (!streamingRun) return;

    // Check for sequence gap
    let gapDetected = streamingRun.gapDetected;
    if (data.seq !== streamingRun.expectedSeq) {
      gapDetected = true;
      console.warn(
        `[ChatStore] Sequence gap detected: expected ${streamingRun.expectedSeq}, got ${data.seq}`
      );
    }

    // Append content
    const newContent = streamingRun.content + data.delta;

    set({
      streamingRun: {
        ...streamingRun,
        content: newContent,
        expectedSeq: data.seq + 1,
        gapDetected
      }
    });

    // Update message content
    get().updateMessage(streamingRun.messageId, {
      content: newContent,
      hasGap: gapDetected
    });
  },

  /**
   * Handle ai_final message - complete response
   * Always replaces streaming content for gap recovery
   */
  handleAIFinal: (data: AIFinalData) => {
    const state = get();
    const streamingRun = state.streamingRun;

    if (streamingRun && streamingRun.runId === data.runId) {
      // Update message with final content (recovers from any gaps)
      get().updateMessage(streamingRun.messageId, {
        content: data.result.content,
        citations: data.result.citations,
        nextCommands: data.result.nextCommands,
        isStreaming: false,
        hasGap: false // Recovered
      });

      set({
        streamingRun: null,
        isLoading: false
      });
    } else {
      // No streaming state - create new message
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: data.result.content,
        timestamp: new Date().toISOString(),
        citations: data.result.citations,
        nextCommands: data.result.nextCommands,
        runId: data.runId
      };

      set((s) => ({
        messages: [...s.messages, assistantMessage],
        isLoading: false
      }));
    }
  },

  /**
   * Handle ai_error message
   */
  handleAIError: (data: AIErrorData) => {
    const state = get();
    const streamingRun = state.streamingRun;

    if (streamingRun && streamingRun.runId === data.runId) {
      // Update streaming message with error
      get().updateMessage(streamingRun.messageId, {
        error: data.error,
        isStreaming: false
      });

      set({
        streamingRun: null,
        isLoading: false
      });
    } else {
      // Create error message
      const errorMessage: ChatMessage = {
        id: `msg_${Date.now()}_error`,
        role: 'system',
        content: `Error: ${data.error}`,
        timestamp: new Date().toISOString(),
        runId: data.runId,
        error: data.error
      };

      set((s) => ({
        messages: [...s.messages, errorMessage],
        isLoading: false
      }));
    }
  },

  // Async actions - HTTP fallback
  sendMessage: async (question, sessionId) => {
    const state = get();
    const basePath = getApiBasePath();

    // Add user message
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: question,
      timestamp: new Date().toISOString()
    };
    set((s) => ({
      messages: [...s.messages, userMessage],
      isLoading: true,
      inputValue: ''
    }));

    try {
      // Prepare file references if any
      const files =
        state.contextFiles.length > 0
          ? state.contextFiles.map((f) => ({ source: f.source, path: f.path }))
          : undefined;

      // Get block contents from registry (includes Claude turns)
      const blockContents = getAllBlockContents(state.contextBlockIds);
      const inlineBlocks =
        blockContents.length > 0
          ? blockContents.map((entry, index) => ({
              id: state.contextBlockIds[index],
              type: entry.type,
              content: entry.content,
              metadata: entry.metadata
            }))
          : undefined;

      const response = await fetch(`${basePath}/api/ai/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context: {
            sessionId,
            blocks: state.contextBlockIds,
            inlineBlocks, // Include block contents for Claude turns
            files,
            renderMode: 'full'
          },
          runner: state.selectedRunner === 'auto' ? undefined : state.selectedRunner,
          conversationId: state.threadId
        })
      });

      const data = (await response.json()) as AIChatResponse;

      // Update thread ID from response
      if (data.runId && !state.threadId) {
        set({ threadId: data.runId.split('_')[0] });
      }

      // Add assistant message
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: data.content,
        timestamp: new Date().toISOString(),
        citations: data.citations,
        nextCommands: data.nextCommands,
        runId: data.runId,
        error: data.error
      };
      set((s) => ({
        messages: [...s.messages, assistantMessage],
        isLoading: false
      }));
    } catch (error) {
      // Add error message
      const errorMessage: ChatMessage = {
        id: `msg_${Date.now()}_error`,
        role: 'system',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      set((s) => ({
        messages: [...s.messages, errorMessage],
        isLoading: false
      }));
    }
  },

  // WebSocket-based message sending
  sendMessageViaWebSocket: async (question, sessionId) => {
    const state = get();

    // Ensure WebSocket is connected
    if (!state.wsConnection || state.wsConnection.readyState !== WebSocket.OPEN) {
      await get().connectWebSocket(sessionId);
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: question,
      timestamp: new Date().toISOString()
    };
    set((s) => ({
      messages: [...s.messages, userMessage],
      isLoading: true,
      inputValue: ''
    }));

    // Send via WebSocket
    const ws = get().wsConnection;
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Prepare file references if any
      const files =
        state.contextFiles.length > 0
          ? state.contextFiles.map((f) => ({ source: f.source, path: f.path }))
          : undefined;

      ws.send(
        JSON.stringify({
          type: 'ai_chat',
          question,
          context: {
            sessionId,
            blocks: state.contextBlockIds,
            files,
            renderMode: 'full'
          },
          runner: state.selectedRunner === 'auto' ? undefined : state.selectedRunner,
          conversationId: state.threadId
        })
      );
    } else {
      // Fallback to HTTP
      console.warn('WebSocket not connected, falling back to HTTP');
      await get().sendMessage(question, sessionId);
    }
  },

  fetchRunners: async () => {
    const basePath = getApiBasePath();
    try {
      const response = await fetch(`${basePath}/api/ai/runners`);
      const data = (await response.json()) as { runners: RunnerStatus[] };
      set({ availableRunners: data.runners });
    } catch (error) {
      console.error('Failed to fetch runners:', error);
    }
  }
}));
