/**
 * Chat Input Component
 *
 * Text input for sending messages to AI.
 */

import { useChatStore } from '@/daemon/native-terminal/client/app/stores/chatStore.js';
import { type FC, type FormEvent, useCallback, useRef, useState } from 'react';
import { FileSelector } from './FileSelector.js';
import { RunnerSelector } from './RunnerSelector.js';

export interface ChatInputProps {
  sessionId: string;
  disabled?: boolean;
}

export const ChatInput: FC<ChatInputProps> = ({ sessionId, disabled = false }) => {
  const inputValue = useChatStore((s) => s.inputValue);
  const setInputValue = useChatStore((s) => s.setInputValue);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const isLoading = useChatStore((s) => s.isLoading);
  const contextBlockIds = useChatStore((s) => s.contextBlockIds);
  const contextFiles = useChatStore((s) => s.contextFiles);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Handle submit
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      const trimmedValue = inputValue.trim();
      if (!trimmedValue || isLoading) return;

      await sendMessage(trimmedValue, sessionId);

      // Focus back to input
      textareaRef.current?.focus();
    },
    [inputValue, isLoading, sendMessage, sessionId]
  );

  // Handle key press (Cmd/Ctrl + Enter to submit)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit(e as unknown as FormEvent);
      }
    },
    [handleSubmit]
  );

  // Auto-resize textarea
  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(e.target.value);

      // Auto-resize
      const textarea = e.target;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    },
    [setInputValue]
  );

  const isDisabled = disabled || isLoading;
  const hasBlocks = contextBlockIds.length > 0;
  const hasFiles = contextFiles.length > 0;
  const hasContext = hasBlocks || hasFiles;

  return (
    <form onSubmit={handleSubmit} style={styles.container}>
      {/* Input area */}
      <div
        style={{
          ...styles.inputContainer,
          ...(isFocused ? styles.inputContainerFocused : {}),
          ...(isDisabled ? styles.inputContainerDisabled : {})
        }}
      >
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={getPlaceholderText(
            hasBlocks,
            hasFiles,
            contextBlockIds.length,
            contextFiles.length
          )}
          disabled={isDisabled}
          rows={1}
          style={styles.textarea}
        />

        {/* Submit button */}
        <button
          type="submit"
          disabled={isDisabled || !inputValue.trim()}
          style={{
            ...styles.submitButton,
            ...(isDisabled || !inputValue.trim() ? styles.submitButtonDisabled : {})
          }}
        >
          {isLoading ? (
            <span style={styles.spinner}>⏳</span>
          ) : (
            <span style={styles.sendIcon}>↑</span>
          )}
        </button>
      </div>

      {/* Bottom bar */}
      <div style={styles.bottomBar}>
        <RunnerSelector disabled={isDisabled} />
        <FileSelector sessionId={sessionId} disabled={isDisabled} />

        <div style={styles.hint}>
          {hasContext ? (
            <span style={styles.contextHint}>
              {getContextHintText(hasBlocks, hasFiles, contextBlockIds.length, contextFiles.length)}
            </span>
          ) : (
            <span style={styles.noContextHint}>Select blocks or attach files</span>
          )}
        </div>

        <span style={styles.shortcut}>⌘↵ to send</span>
      </div>
    </form>
  );
};

// Helper functions
function getPlaceholderText(
  hasBlocks: boolean,
  hasFiles: boolean,
  blockCount: number,
  fileCount: number
): string {
  if (!hasBlocks && !hasFiles) {
    return 'Select blocks or attach files to ask questions...';
  }
  const parts: string[] = [];
  if (hasBlocks) {
    parts.push(`${blockCount} block${blockCount > 1 ? 's' : ''}`);
  }
  if (hasFiles) {
    parts.push(`${fileCount} file${fileCount > 1 ? 's' : ''}`);
  }
  return `Ask about ${parts.join(' and ')}...`;
}

function getContextHintText(
  hasBlocks: boolean,
  hasFiles: boolean,
  blockCount: number,
  fileCount: number
): string {
  const parts: string[] = [];
  if (hasBlocks) {
    parts.push(`${blockCount} block${blockCount > 1 ? 's' : ''}`);
  }
  if (hasFiles) {
    parts.push(`${fileCount} file${fileCount > 1 ? 's' : ''}`);
  }
  return parts.join(', ') + ' in context';
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '8px 12px 12px',
    borderTop: '1px solid #333'
  },
  inputContainer: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
    padding: '8px 10px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    border: '1px solid #444',
    transition: 'border-color 0.2s'
  },
  inputContainerFocused: {
    borderColor: '#3a86ff'
  },
  inputContainerDisabled: {
    opacity: 0.5
  },
  textarea: {
    flex: 1,
    padding: 0,
    fontSize: '13px',
    color: '#ddd',
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    resize: 'none',
    fontFamily: 'inherit',
    lineHeight: 1.5,
    maxHeight: '150px'
  },
  submitButton: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3a86ff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    flexShrink: 0
  },
  submitButtonDisabled: {
    backgroundColor: '#444',
    cursor: 'not-allowed'
  },
  sendIcon: {
    color: '#fff',
    fontSize: '16px',
    fontWeight: 'bold'
  },
  spinner: {
    fontSize: '14px'
  },
  bottomBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '8px'
  },
  hint: {
    flex: 1
  },
  contextHint: {
    fontSize: '11px',
    color: '#4caf50'
  },
  noContextHint: {
    fontSize: '11px',
    color: '#888'
  },
  shortcut: {
    fontSize: '10px',
    color: '#666'
  }
};
