/**
 * Chat Thread Component
 *
 * Displays chat messages with AI responses.
 */

import type { Citation, NextCommand } from '@/daemon/native-terminal/ai/types.js';
import {
  type ChatMessage,
  useChatStore
} from '@/daemon/native-terminal/client/app/stores/chatStore.js';
import { type FC, useEffect, useRef } from 'react';

export interface ChatThreadProps {
  onCitationClick?: (blockId: string) => void;
  onCommandClick?: (command: string) => void;
}

export const ChatThread: FC<ChatThreadProps> = ({ onCitationClick, onCommandClick }) => {
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  return (
    <div ref={scrollRef} style={styles.container}>
      {messages.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>💬</div>
          <div style={styles.emptyText}>No messages yet</div>
          <div style={styles.emptyHint}>Select blocks and ask questions about terminal output</div>
        </div>
      ) : (
        <>
          {messages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              onCitationClick={onCitationClick}
              onCommandClick={onCommandClick}
            />
          ))}
        </>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div style={styles.loading}>
          <span style={styles.loadingDot}>●</span>
          <span style={styles.loadingDot}>●</span>
          <span style={styles.loadingDot}>●</span>
        </div>
      )}
    </div>
  );
};

// Message item component
interface MessageItemProps {
  message: ChatMessage;
  onCitationClick?: (blockId: string) => void;
  onCommandClick?: (command: string) => void;
}

const MessageItem: FC<MessageItemProps> = ({ message, onCitationClick, onCommandClick }) => {
  const isUser = message.role === 'user';
  const isError = message.role === 'system' || message.error;

  return (
    <div
      style={{
        ...styles.message,
        ...(isUser ? styles.userMessage : styles.assistantMessage),
        ...(isError ? styles.errorMessage : {})
      }}
    >
      {/* Role indicator */}
      <div style={styles.messageHeader}>
        <span style={styles.roleIcon}>{isUser ? '👤' : isError ? '⚠️' : '🤖'}</span>
        <span style={styles.timestamp}>{formatTime(message.timestamp)}</span>
      </div>

      {/* Content */}
      <div style={styles.content}>{message.content}</div>

      {/* Citations */}
      {message.citations && message.citations.length > 0 && (
        <Citations citations={message.citations} onClick={onCitationClick} />
      )}

      {/* Suggested commands */}
      {message.nextCommands && message.nextCommands.length > 0 && (
        <SuggestedCommands commands={message.nextCommands} onClick={onCommandClick} />
      )}
    </div>
  );
};

// Citations component
interface CitationsProps {
  citations: Citation[];
  onClick?: (blockId: string) => void;
}

const Citations: FC<CitationsProps> = ({ citations, onClick }) => (
  <div style={styles.citations}>
    <div style={styles.citationsHeader}>References:</div>
    {citations.map((citation, index) => (
      <button
        key={`${citation.blockId}-${index}`}
        type="button"
        style={styles.citation}
        onClick={() => onClick?.(citation.blockId)}
      >
        <span style={styles.citationId}>[{citation.blockId}]</span>
        <span style={styles.citationReason}>{citation.reason}</span>
      </button>
    ))}
  </div>
);

// Suggested commands component
interface SuggestedCommandsProps {
  commands: NextCommand[];
  onClick?: (command: string) => void;
}

const SuggestedCommands: FC<SuggestedCommandsProps> = ({ commands, onClick }) => (
  <div style={styles.commands}>
    <div style={styles.commandsHeader}>Suggested commands:</div>
    {commands.map((cmd, index) => (
      <button
        key={`${cmd.command}-${index}`}
        type="button"
        style={{
          ...styles.command,
          borderColor: getRiskColor(cmd.risk)
        }}
        onClick={() => onClick?.(cmd.command)}
        title={cmd.description}
      >
        <span style={styles.commandText}>{cmd.command}</span>
        <span style={{ ...styles.riskBadge, backgroundColor: getRiskColor(cmd.risk) }}>
          {cmd.risk}
        </span>
      </button>
    ))}
  </div>
);

// Helper functions
function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

function getRiskColor(risk: string): string {
  switch (risk) {
    case 'dangerous':
      return '#f44336';
    case 'caution':
      return '#ff9800';
    default:
      return '#4caf50';
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#666'
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px'
  },
  emptyText: {
    fontSize: '16px',
    marginBottom: '8px'
  },
  emptyHint: {
    fontSize: '12px',
    textAlign: 'center',
    maxWidth: '200px'
  },
  message: {
    padding: '10px 12px',
    borderRadius: '8px',
    maxWidth: '90%'
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#2a4a7a'
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#2a2a2a'
  },
  errorMessage: {
    backgroundColor: 'rgba(244, 67, 54, 0.2)',
    borderLeft: '3px solid #f44336'
  },
  messageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px'
  },
  roleIcon: {
    fontSize: '14px'
  },
  timestamp: {
    fontSize: '10px',
    color: '#888'
  },
  content: {
    fontSize: '13px',
    lineHeight: 1.5,
    color: '#ddd',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  citations: {
    marginTop: '10px',
    paddingTop: '8px',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)'
  },
  citationsHeader: {
    fontSize: '11px',
    color: '#888',
    marginBottom: '6px'
  },
  citation: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 6px',
    fontSize: '11px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    marginBottom: '4px',
    textAlign: 'left',
    width: '100%'
  },
  citationId: {
    color: '#64b5f6',
    fontFamily: 'monospace'
  },
  citationReason: {
    color: '#aaa',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  commands: {
    marginTop: '10px',
    paddingTop: '8px',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)'
  },
  commandsHeader: {
    fontSize: '11px',
    color: '#888',
    marginBottom: '6px'
  },
  command: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    fontSize: '12px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid',
    borderRadius: '4px',
    cursor: 'pointer',
    marginBottom: '4px',
    textAlign: 'left',
    width: '100%'
  },
  commandText: {
    flex: 1,
    fontFamily: 'monospace',
    color: '#ddd'
  },
  riskBadge: {
    fontSize: '9px',
    padding: '2px 4px',
    borderRadius: '3px',
    color: '#fff',
    textTransform: 'uppercase'
  },
  loading: {
    display: 'flex',
    gap: '4px',
    padding: '10px',
    alignSelf: 'flex-start'
  },
  loadingDot: {
    fontSize: '8px',
    color: '#888',
    animation: 'pulse 1s ease-in-out infinite'
  }
};
