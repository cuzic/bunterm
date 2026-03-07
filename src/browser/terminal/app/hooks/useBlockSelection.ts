/**
 * useBlockSelection Hook
 *
 * React hook for managing block selection state.
 */

import type { Block } from '@/daemon/native-terminal/client/BlockManager.js';
import { useBlockStore } from '@/daemon/native-terminal/client/app/stores/blockStore.js';
import { useChatStore } from '@/daemon/native-terminal/client/app/stores/chatStore.js';
import { useCallback } from 'react';

export interface UseBlockSelectionReturn {
  selectedBlockIds: Set<string>;
  focusedBlockId: string | null;
  selectBlock: (blockId: string) => void;
  toggleBlockSelection: (blockId: string) => void;
  selectBlockRange: (blockId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  focusBlock: (blockId: string | null) => void;
  focusPreviousBlock: () => void;
  focusNextBlock: () => void;
  handleBlockClick: (blockId: string, event: React.MouseEvent) => void;
  addToContext: (blockIds: string[]) => void;
  removeFromContext: (blockId: string) => void;
  clearContext: () => void;
  getSelectedBlocks: () => Block[];
}

export function useBlockSelection(): UseBlockSelectionReturn {
  // Block store state
  const selectedBlockIds = useBlockStore((s) => s.selectedBlockIds);
  const focusedBlockId = useBlockStore((s) => s.focusedBlockId);
  const blocks = useBlockStore((s) => s.blocks);

  // Block store actions
  const selectBlock = useBlockStore((s) => s.selectBlock);
  const toggleBlockSelection = useBlockStore((s) => s.toggleBlockSelection);
  const selectBlockRangeAction = useBlockStore((s) => s.selectBlockRange);
  const selectAll = useBlockStore((s) => s.selectAll);
  const clearSelection = useBlockStore((s) => s.clearSelection);
  const focusBlock = useBlockStore((s) => s.focusBlock);
  const focusPreviousBlock = useBlockStore((s) => s.focusPreviousBlock);
  const focusNextBlock = useBlockStore((s) => s.focusNextBlock);

  // Chat store actions
  const addContextBlock = useChatStore((s) => s.addContextBlock);
  const removeContextBlock = useChatStore((s) => s.removeContextBlock);
  const clearContextBlocks = useChatStore((s) => s.clearContextBlocks);
  const setContextBlocks = useChatStore((s) => s.setContextBlocks);

  // Select block range using current block order
  const selectBlockRange = useCallback(
    (blockId: string) => {
      const blockIds = blocks.map((b) => b.id);
      selectBlockRangeAction(blockId, blockIds);
    },
    [blocks, selectBlockRangeAction]
  );

  // Handle block click with modifier keys
  const handleBlockClick = useCallback(
    (blockId: string, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;

      if (event.shiftKey) {
        // Shift+Click: Range selection
        selectBlockRange(blockId);
      } else if (cmdOrCtrl) {
        // Cmd/Ctrl+Click: Toggle selection
        toggleBlockSelection(blockId);
      } else {
        // Plain click: Single selection
        selectBlock(blockId);
      }

      // Focus the clicked block
      focusBlock(blockId);
    },
    [selectBlock, toggleBlockSelection, selectBlockRange, focusBlock]
  );

  // Add blocks to AI context
  const addToContext = useCallback(
    (blockIds: string[]) => {
      for (const blockId of blockIds) {
        addContextBlock(blockId);
      }
    },
    [addContextBlock]
  );

  // Remove block from AI context
  const removeFromContext = useCallback(
    (blockId: string) => {
      removeContextBlock(blockId);
    },
    [removeContextBlock]
  );

  // Clear AI context
  const clearContext = useCallback(() => {
    clearContextBlocks();
  }, [clearContextBlocks]);

  // Get selected blocks
  const getSelectedBlocks = useCallback((): Block[] => {
    return blocks.filter((b) => selectedBlockIds.has(b.id));
  }, [blocks, selectedBlockIds]);

  return {
    selectedBlockIds,
    focusedBlockId,
    selectBlock,
    toggleBlockSelection,
    selectBlockRange,
    selectAll,
    clearSelection,
    focusBlock,
    focusPreviousBlock,
    focusNextBlock,
    handleBlockClick,
    addToContext,
    removeFromContext,
    clearContext,
    getSelectedBlocks
  };
}
