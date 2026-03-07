/**
 * Suggested Actions Component
 *
 * Quick action buttons for common AI queries.
 */

import { useChatStore } from '@/daemon/native-terminal/client/app/stores/chatStore.js';
import { type FC, useCallback } from 'react';

export interface SuggestedActionsProps {
  sessionId: string;
  disabled?: boolean;
}

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  question: string;
  requiresContext: boolean;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'explain-error',
    label: 'Explain Error',
    icon: '❓',
    question: 'Please explain what this error means and how to fix it.',
    requiresContext: true
  },
  {
    id: 'suggest-fix',
    label: 'Suggest Fix',
    icon: '🔧',
    question: 'What command should I run to fix this issue?',
    requiresContext: true
  },
  {
    id: 'summarize',
    label: 'Summarize',
    icon: '📝',
    question: 'Please summarize what these commands did and their results.',
    requiresContext: true
  },
  {
    id: 'next-step',
    label: 'What Next?',
    icon: '➡️',
    question: 'Based on this output, what should I do next?',
    requiresContext: true
  }
];

export const SuggestedActions: FC<SuggestedActionsProps> = ({ sessionId, disabled = false }) => {
  const contextBlockIds = useChatStore((s) => s.contextBlockIds);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const isLoading = useChatStore((s) => s.isLoading);

  const hasContext = contextBlockIds.length > 0;

  // Handle action click
  const handleActionClick = useCallback(
    async (action: QuickAction) => {
      if (action.requiresContext && !hasContext) {
        return;
      }

      await sendMessage(action.question, sessionId);
    },
    [hasContext, sendMessage, sessionId]
  );

  // Don't show if no context and all actions require context
  if (!hasContext && QUICK_ACTIONS.every((a) => a.requiresContext)) {
    return null;
  }

  return (
    <div style={styles.container}>
      <div style={styles.label}>Quick actions:</div>
      <div style={styles.actions}>
        {QUICK_ACTIONS.map((action) => {
          const isDisabled = disabled || isLoading || (action.requiresContext && !hasContext);

          return (
            <button
              key={action.id}
              type="button"
              style={{
                ...styles.actionButton,
                ...(isDisabled ? styles.actionButtonDisabled : {})
              }}
              onClick={() => handleActionClick(action)}
              disabled={isDisabled}
              title={action.question}
            >
              <span style={styles.actionIcon}>{action.icon}</span>
              <span style={styles.actionLabel}>{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '8px 12px',
    borderTop: '1px solid #333'
  },
  label: {
    fontSize: '10px',
    color: '#666',
    marginBottom: '6px'
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px'
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '5px 10px',
    fontSize: '11px',
    color: '#ccc',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid #444',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.1s, border-color 0.1s'
  },
  actionButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed'
  },
  actionIcon: {
    fontSize: '12px'
  },
  actionLabel: {
    fontWeight: 500
  }
};
