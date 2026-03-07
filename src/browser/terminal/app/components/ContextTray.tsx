/**
 * Context Tray Component
 *
 * Shows selected blocks and files for AI context.
 */

import type { FileSource } from '@/daemon/native-terminal/ai/types.js';
import { useBlockStore } from '@/daemon/native-terminal/client/app/stores/blockStore.js';
import { useChatStore } from '@/daemon/native-terminal/client/app/stores/chatStore.js';
import { type FC, useMemo } from 'react';

export interface ContextTrayProps {
  onClose?: () => void;
}

export const ContextTray: FC<ContextTrayProps> = ({ onClose }) => {
  // Block state
  const blocks = useBlockStore((s) => s.blocks);

  // Chat state
  const contextBlockIds = useChatStore((s) => s.contextBlockIds);
  const removeContextBlock = useChatStore((s) => s.removeContextBlock);
  const clearContextBlocks = useChatStore((s) => s.clearContextBlocks);

  // File state
  const contextFiles = useChatStore((s) => s.contextFiles);
  const removeContextFile = useChatStore((s) => s.removeContextFile);
  const clearContextFiles = useChatStore((s) => s.clearContextFiles);

  // Get context blocks
  const contextBlocks = useMemo(() => {
    return contextBlockIds
      .map((id) => blocks.find((b) => b.id === id))
      .filter((b): b is NonNullable<typeof b> => b !== undefined);
  }, [contextBlockIds, blocks]);

  // Estimate context size (blocks + files)
  const contextEstimate = useMemo(() => {
    let totalChars = 0;

    // Block content
    for (const block of contextBlocks) {
      totalChars += block.command.length;
      totalChars += block.output?.length ?? 0;
    }

    // File content (estimate based on file size)
    for (const file of contextFiles) {
      totalChars += file.size;
    }

    const estimatedTokens = Math.ceil(totalChars / 4);
    return { totalChars, estimatedTokens };
  }, [contextBlocks, contextFiles]);

  // Clear all context
  const handleClearAll = () => {
    clearContextBlocks();
    clearContextFiles();
  };

  // Check if there's any context
  const hasContext = contextBlockIds.length > 0 || contextFiles.length > 0;

  if (!hasContext) {
    return null;
  }

  // Build count string
  const countParts: string[] = [];
  if (contextBlockIds.length > 0) {
    countParts.push(`${contextBlockIds.length} block${contextBlockIds.length > 1 ? 's' : ''}`);
  }
  if (contextFiles.length > 0) {
    countParts.push(`${contextFiles.length} file${contextFiles.length > 1 ? 's' : ''}`);
  }
  const countText = countParts.join(', ');

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>AI Context</span>
        <span style={styles.count}>{countText}</span>
        <span style={styles.estimate}>~{contextEstimate.estimatedTokens} tokens</span>
        <button type="button" style={styles.clearButton} onClick={handleClearAll}>
          Clear All
        </button>
      </div>

      {/* Block list */}
      {contextBlocks.length > 0 && (
        <div style={styles.blockList}>
          {contextBlocks.map((block) => (
            <div key={block.id} style={styles.blockItem}>
              <span
                style={{ ...styles.statusDot, backgroundColor: getStatusColor(block.status) }}
              />
              <span style={styles.command}>{truncateCommand(block.command, 40)}</span>
              <button
                type="button"
                style={styles.removeButton}
                onClick={() => removeContextBlock(block.id)}
                title="Remove from context"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* File list */}
      {contextFiles.length > 0 && (
        <div style={styles.fileList}>
          {contextFiles.map((file) => (
            <div key={`${file.source}:${file.path}`} style={styles.fileItem}>
              <span style={styles.fileIcon}>{getFileIcon(file.source)}</span>
              <span style={styles.filePath}>{truncateFilePath(file.path, 35)}</span>
              <span style={styles.fileSize}>{formatFileSize(file.size)}</span>
              <button
                type="button"
                style={styles.removeButton}
                onClick={() => removeContextFile(file.source, file.path)}
                title="Remove from context"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Warning for large context */}
      {contextEstimate.estimatedTokens > 50000 && (
        <div style={styles.warning}>Large context may slow down responses and increase costs.</div>
      )}
    </div>
  );
};

// Helper functions
function getStatusColor(status: string): string {
  switch (status) {
    case 'success':
      return '#4caf50';
    case 'error':
      return '#f44336';
    case 'running':
      return '#ff9800';
    default:
      return '#888';
  }
}

function truncateCommand(command: string, maxLength: number): string {
  if (command.length <= maxLength) return command;
  return command.slice(0, maxLength - 3) + '...';
}

function truncateFilePath(path: string, maxLength: number): string {
  if (path.length <= maxLength) return path;
  // Keep the filename and truncate the directory part
  const parts = path.split('/');
  const filename = parts.pop() ?? '';
  if (filename.length >= maxLength - 3) {
    return '...' + filename.slice(-(maxLength - 3));
  }
  const remaining = maxLength - filename.length - 4; // ".../"
  const dir = parts.join('/');
  if (dir.length > remaining) {
    return '...' + dir.slice(-remaining) + '/' + filename;
  }
  return path;
}

function getFileIcon(source: FileSource): string {
  return source === 'plans' ? '\u{1F4CB}' : '\u{1F4C1}'; // clipboard vs folder
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderBottom: '1px solid #333',
    padding: '8px'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px'
  },
  title: {
    color: '#fff',
    fontSize: '12px',
    fontWeight: 'bold'
  },
  count: {
    color: '#888',
    fontSize: '11px'
  },
  estimate: {
    color: '#666',
    fontSize: '10px',
    flex: 1
  },
  clearButton: {
    padding: '2px 8px',
    fontSize: '11px',
    color: '#888',
    backgroundColor: 'transparent',
    border: '1px solid #555',
    borderRadius: '3px',
    cursor: 'pointer'
  },
  blockList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '120px',
    overflowY: 'auto'
  },
  blockItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 6px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '4px',
    fontSize: '11px'
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0
  },
  command: {
    color: '#ccc',
    fontFamily: 'monospace',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  removeButton: {
    padding: '0 4px',
    fontSize: '14px',
    color: '#888',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    lineHeight: 1
  },
  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '80px',
    overflowY: 'auto',
    marginTop: '6px'
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 6px',
    backgroundColor: 'rgba(58, 134, 255, 0.08)',
    borderRadius: '4px',
    fontSize: '11px'
  },
  fileIcon: {
    fontSize: '12px',
    flexShrink: 0
  },
  filePath: {
    color: '#aad',
    fontFamily: 'monospace',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  fileSize: {
    color: '#666',
    fontSize: '10px',
    flexShrink: 0
  },
  warning: {
    marginTop: '8px',
    padding: '6px 8px',
    fontSize: '11px',
    color: '#ff9800',
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderRadius: '4px'
  }
};
