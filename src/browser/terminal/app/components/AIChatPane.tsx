/**
 * AI Chat Pane Component
 *
 * Right pane containing AI chat interface.
 */

import { useChatStore } from '@/daemon/native-terminal/client/app/stores/chatStore.js';
import { type FC, useCallback } from 'react';
import { ChatInput } from './ChatInput.js';
import { ChatThread } from './ChatThread.js';
import { ContextTray } from './ContextTray.js';
import { SuggestedActions } from './SuggestedActions.js';

export interface AIChatPaneProps {
  sessionId: string;
  sessionName: string;
  onCitationClick?: (blockId: string) => void;
  onCommandExecute?: (command: string) => void;
}

export const AIChatPane: FC<AIChatPaneProps> = ({
  sessionId,
  sessionName,
  onCitationClick,
  onCommandExecute
}) => {
  const clearMessages = useChatStore((s) => s.clearMessages);
  const messages = useChatStore((s) => s.messages);

  // Handle citation click
  const handleCitationClick = useCallback(
    (blockId: string) => {
      onCitationClick?.(blockId);
    },
    [onCitationClick]
  );

  // Handle command click
  const handleCommandClick = useCallback(
    (command: string) => {
      if (onCommandExecute) {
        onCommandExecute(command);
      } else {
        // Copy to clipboard as fallback
        navigator.clipboard.writeText(command).catch(console.error);
      }
    },
    [onCommandExecute]
  );

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.title}>AI Assistant</span>
          <span style={styles.sessionName}>{sessionName}</span>
        </div>
        <div style={styles.headerRight}>
          {messages.length > 0 && (
            <button
              type="button"
              style={styles.clearButton}
              onClick={clearMessages}
              title="Clear chat"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Context tray */}
      <ContextTray />

      {/* Chat thread */}
      <ChatThread onCitationClick={handleCitationClick} onCommandClick={handleCommandClick} />

      {/* Suggested actions */}
      <SuggestedActions sessionId={sessionId} />

      {/* Input */}
      <ChatInput sessionId={sessionId} />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1a1a1a',
    borderLeft: '1px solid #333'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid #333'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff'
  },
  sessionName: {
    fontSize: '11px',
    color: '#888',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: '2px 6px',
    borderRadius: '3px'
  },
  headerRight: {
    display: 'flex',
    gap: '8px'
  },
  clearButton: {
    padding: '4px 8px',
    fontSize: '11px',
    color: '#888',
    backgroundColor: 'transparent',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer'
  }
};
