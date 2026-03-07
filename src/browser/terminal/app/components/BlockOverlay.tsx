/**
 * Block Overlay Component
 *
 * Renders block boundaries and selection UI over the terminal.
 */

import type { Block } from '@/daemon/native-terminal/client/BlockManager.js';
import { useBlockSelection } from '@/daemon/native-terminal/client/app/hooks/useBlockSelection.js';
import { useBlockStore } from '@/daemon/native-terminal/client/app/stores/blockStore.js';
import { useChatStore } from '@/daemon/native-terminal/client/app/stores/chatStore.js';
import { type FC, useCallback, useMemo, useState } from 'react';

export interface BlockOverlayProps {
  terminalElement: HTMLElement | null;
}

export const BlockOverlay: FC<BlockOverlayProps> = ({ terminalElement }) => {
  // Visibility state - collapsed by default
  const [isExpanded, setIsExpanded] = useState(false);

  // Block state
  const blocks = useBlockStore((s) => s.blocks);
  const filter = useBlockStore((s) => s.filter);
  const setFilter = useBlockStore((s) => s.setFilter);
  const counts = useBlockStore((s) => s.counts);

  // Selection
  const { selectedBlockIds, focusedBlockId, handleBlockClick, addToContext } = useBlockSelection();

  // Chat state
  const contextBlockIds = useChatStore((s) => s.contextBlockIds);
  const toggleChat = useChatStore((s) => s.toggleOpen);

  // Filtered blocks
  const filteredBlocks = useMemo(() => {
    if (filter === 'all') return blocks;
    return blocks.filter((b) => b.status === filter);
  }, [blocks, filter]);

  // Handle send to AI
  const handleSendToAI = useCallback(
    (block: Block) => {
      addToContext([block.id]);
      toggleChat();
    },
    [addToContext, toggleChat]
  );

  // Handle filter change
  const handleFilterClick = useCallback(
    (newFilter: 'all' | 'success' | 'error' | 'running') => {
      setFilter(newFilter);
    },
    [setFilter]
  );

  if (!terminalElement || blocks.length === 0) {
    return null;
  }

  // Collapsed view - just show a toggle button
  if (!isExpanded) {
    return (
      <div style={styles.overlay}>
        <button
          type="button"
          style={styles.toggleButton}
          onClick={() => setIsExpanded(true)}
          title="Show block list"
        >
          📋 {counts.all}
          {counts.error > 0 && <span style={styles.errorBadge}>{counts.error}</span>}
        </button>
      </div>
    );
  }

  return (
    <div style={styles.overlay}>
      {/* Filter toolbar */}
      <div style={styles.filterBar}>
        <button
          type="button"
          style={styles.collapseButton}
          onClick={() => setIsExpanded(false)}
          title="Hide block list"
        >
          ✕
        </button>
        <FilterButton
          label="All"
          count={counts.all}
          active={filter === 'all'}
          onClick={() => handleFilterClick('all')}
        />
        <FilterButton
          label="Success"
          count={counts.success}
          active={filter === 'success'}
          color="#4caf50"
          onClick={() => handleFilterClick('success')}
        />
        <FilterButton
          label="Error"
          count={counts.error}
          active={filter === 'error'}
          color="#f44336"
          onClick={() => handleFilterClick('error')}
        />
        <FilterButton
          label="Running"
          count={counts.running}
          active={filter === 'running'}
          color="#ff9800"
          onClick={() => handleFilterClick('running')}
        />
      </div>

      {/* Block headers */}
      <div style={styles.blockList}>
        {filteredBlocks.map((block, index) => (
          <BlockHeader
            key={block.id}
            block={block}
            index={index + 1}
            isSelected={selectedBlockIds.has(block.id)}
            isFocused={focusedBlockId === block.id}
            isInContext={contextBlockIds.includes(block.id)}
            onClick={(e) => handleBlockClick(block.id, e)}
            onSendToAI={() => handleSendToAI(block)}
          />
        ))}
      </div>
    </div>
  );
};

// Filter button component
interface FilterButtonProps {
  label: string;
  count: number;
  active: boolean;
  color?: string;
  onClick: () => void;
}

const FilterButton: FC<FilterButtonProps> = ({ label, count, active, color, onClick }) => (
  <button
    type="button"
    style={{
      ...styles.filterButton,
      backgroundColor: active ? (color ?? '#3a3a3a') : 'transparent',
      borderColor: color ?? '#555'
    }}
    onClick={onClick}
  >
    {label} <span style={styles.filterCount}>{count}</span>
  </button>
);

// Block header component
interface BlockHeaderProps {
  block: Block;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  isInContext: boolean;
  onClick: (e: React.MouseEvent) => void;
  onSendToAI: () => void;
}

const BlockHeader: FC<BlockHeaderProps> = ({
  block,
  index,
  isSelected,
  isFocused,
  isInContext,
  onClick,
  onSendToAI
}) => {
  const statusColor = getStatusColor(block.status);
  const statusIcon = getStatusIcon(block.status);
  const duration = block.endedAt ? calculateDuration(block.startedAt, block.endedAt) : null;

  return (
    <div
      style={{
        ...styles.blockHeader,
        backgroundColor: isSelected
          ? 'rgba(66, 165, 245, 0.2)'
          : isFocused
            ? 'rgba(255, 255, 255, 0.05)'
            : 'transparent',
        borderLeftColor: statusColor
      }}
      onClick={onClick}
    >
      {/* Status indicator */}
      <span style={{ ...styles.statusIcon, color: statusColor }}>{statusIcon}</span>

      {/* Block number */}
      <span style={styles.blockIndex}>#{index}</span>

      {/* Command */}
      <span style={styles.command}>{truncateCommand(block.command, 60)}</span>

      {/* Context indicator */}
      {isInContext && <span style={styles.contextBadge}>AI</span>}

      {/* Duration */}
      {duration && <span style={styles.duration}>{duration}</span>}

      {/* Exit code */}
      {block.exitCode !== undefined && block.exitCode !== 0 && (
        <span style={styles.exitCode}>Exit: {block.exitCode}</span>
      )}

      {/* Actions */}
      <div style={styles.actions}>
        <button
          type="button"
          style={styles.actionButton}
          onClick={(e) => {
            e.stopPropagation();
            onSendToAI();
          }}
          title="Send to AI"
        >
          💬
        </button>
      </div>
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

function getStatusIcon(status: string): string {
  switch (status) {
    case 'success':
      return '✓';
    case 'error':
      return '✗';
    case 'running':
      return '⏳';
    default:
      return '○';
  }
}

function truncateCommand(command: string, maxLength: number): string {
  if (command.length <= maxLength) return command;
  return command.slice(0, maxLength - 3) + '...';
}

function calculateDuration(start: string, end: string): string {
  const durationMs = new Date(end).getTime() - new Date(start).getTime();
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    pointerEvents: 'none',
    zIndex: 100
  },
  filterBar: {
    display: 'flex',
    gap: '4px',
    padding: '4px 8px',
    backgroundColor: 'rgba(30, 30, 30, 0.9)',
    borderBottom: '1px solid #333',
    pointerEvents: 'auto'
  },
  filterButton: {
    padding: '4px 8px',
    fontSize: '12px',
    color: '#ccc',
    backgroundColor: 'transparent',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  filterCount: {
    fontSize: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: '1px 4px',
    borderRadius: '3px'
  },
  blockList: {
    display: 'flex',
    flexDirection: 'column',
    pointerEvents: 'auto'
  },
  blockHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 8px',
    fontSize: '12px',
    color: '#ccc',
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    borderLeft: '3px solid #888',
    cursor: 'pointer',
    transition: 'background-color 0.1s'
  },
  statusIcon: {
    fontSize: '14px',
    width: '16px',
    textAlign: 'center'
  },
  blockIndex: {
    color: '#888',
    fontSize: '11px',
    minWidth: '24px'
  },
  command: {
    fontFamily: 'monospace',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  contextBadge: {
    fontSize: '10px',
    backgroundColor: '#3a86ff',
    color: '#fff',
    padding: '1px 4px',
    borderRadius: '3px'
  },
  duration: {
    color: '#888',
    fontSize: '11px'
  },
  exitCode: {
    color: '#f44336',
    fontSize: '11px'
  },
  actions: {
    display: 'flex',
    gap: '4px',
    opacity: 0.6
  },
  actionButton: {
    padding: '2px 4px',
    fontSize: '12px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer'
  },
  toggleButton: {
    padding: '4px 8px',
    fontSize: '12px',
    color: '#ccc',
    backgroundColor: 'rgba(30, 30, 30, 0.9)',
    border: '1px solid #444',
    borderRadius: '4px',
    cursor: 'pointer',
    pointerEvents: 'auto',
    margin: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  collapseButton: {
    padding: '2px 6px',
    fontSize: '12px',
    color: '#888',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer'
  },
  errorBadge: {
    fontSize: '10px',
    backgroundColor: '#f44336',
    color: '#fff',
    padding: '1px 4px',
    borderRadius: '3px',
    marginLeft: '4px'
  }
};
