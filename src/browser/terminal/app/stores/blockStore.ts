/**
 * Block Store (Zustand)
 *
 * State management for block selection and UI state.
 */

import type {
  Block,
  BlockCounts,
  BlockFilter
} from '@/daemon/native-terminal/client/BlockManager.js';
import { create } from 'zustand';

export interface BlockStoreState {
  // Block data
  blocks: Block[];
  activeBlockId: string | null;

  // Selection
  selectedBlockIds: Set<string>;
  lastSelectedId: string | null;

  // Filter
  filter: BlockFilter;
  counts: BlockCounts;

  // Focus/navigation
  focusedBlockId: string | null;

  // UI state
  sidebarVisible: boolean;
  searchQuery: string;
  searchResults: string[];

  // Actions
  setBlocks: (blocks: Block[]) => void;
  addBlock: (block: Block) => void;
  updateBlock: (block: Block) => void;
  setActiveBlockId: (id: string | null) => void;

  // Selection actions
  selectBlock: (blockId: string) => void;
  toggleBlockSelection: (blockId: string) => void;
  selectBlockRange: (blockId: string, blockIds: string[]) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Filter actions
  setFilter: (filter: BlockFilter) => void;
  updateCounts: (counts: BlockCounts) => void;

  // Focus actions
  focusBlock: (blockId: string | null) => void;
  focusPreviousBlock: () => void;
  focusNextBlock: () => void;

  // UI actions
  toggleSidebar: () => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: string[]) => void;
}

export const useBlockStore = create<BlockStoreState>((set, get) => ({
  // Initial state
  blocks: [],
  activeBlockId: null,
  selectedBlockIds: new Set(),
  lastSelectedId: null,
  filter: 'all',
  counts: { all: 0, success: 0, error: 0, running: 0 },
  focusedBlockId: null,
  sidebarVisible: false,
  searchQuery: '',
  searchResults: [],

  // Block actions
  setBlocks: (blocks) => set({ blocks }),

  addBlock: (block) =>
    set((state) => ({
      blocks: [...state.blocks, block],
      counts: updateCounts([...state.blocks, block])
    })),

  updateBlock: (updatedBlock) =>
    set((state) => ({
      blocks: state.blocks.map((b) => (b.id === updatedBlock.id ? updatedBlock : b)),
      counts: updateCounts(state.blocks.map((b) => (b.id === updatedBlock.id ? updatedBlock : b)))
    })),

  setActiveBlockId: (id) => set({ activeBlockId: id }),

  // Selection actions
  selectBlock: (blockId) =>
    set({
      selectedBlockIds: new Set([blockId]),
      lastSelectedId: blockId
    }),

  toggleBlockSelection: (blockId) =>
    set((state) => {
      const newSelection = new Set(state.selectedBlockIds);
      if (newSelection.has(blockId)) {
        newSelection.delete(blockId);
      } else {
        newSelection.add(blockId);
      }
      return {
        selectedBlockIds: newSelection,
        lastSelectedId: blockId
      };
    }),

  selectBlockRange: (blockId, blockIds) =>
    set((state) => {
      const lastId = state.lastSelectedId;
      if (!lastId) {
        return {
          selectedBlockIds: new Set([blockId]),
          lastSelectedId: blockId
        };
      }

      const startIdx = blockIds.indexOf(lastId);
      const endIdx = blockIds.indexOf(blockId);

      if (startIdx === -1 || endIdx === -1) {
        return {
          selectedBlockIds: new Set([blockId]),
          lastSelectedId: blockId
        };
      }

      const minIdx = Math.min(startIdx, endIdx);
      const maxIdx = Math.max(startIdx, endIdx);
      const rangeIds = blockIds.slice(minIdx, maxIdx + 1);

      return {
        selectedBlockIds: new Set([...state.selectedBlockIds, ...rangeIds]),
        lastSelectedId: blockId
      };
    }),

  selectAll: () =>
    set((state) => ({
      selectedBlockIds: new Set(state.blocks.map((b) => b.id))
    })),

  clearSelection: () =>
    set({
      selectedBlockIds: new Set(),
      lastSelectedId: null
    }),

  // Filter actions
  setFilter: (filter) => set({ filter }),

  updateCounts: (counts) => set({ counts }),

  // Focus actions
  focusBlock: (blockId) => set({ focusedBlockId: blockId }),

  focusPreviousBlock: () =>
    set((state) => {
      const filteredIds = getFilteredBlockIds(state.blocks, state.filter);
      if (filteredIds.length === 0) return state;

      if (!state.focusedBlockId) {
        return { focusedBlockId: filteredIds[filteredIds.length - 1] ?? null };
      }

      const currentIdx = filteredIds.indexOf(state.focusedBlockId);
      if (currentIdx > 0) {
        return { focusedBlockId: filteredIds[currentIdx - 1] ?? null };
      }
      return state;
    }),

  focusNextBlock: () =>
    set((state) => {
      const filteredIds = getFilteredBlockIds(state.blocks, state.filter);
      if (filteredIds.length === 0) return state;

      if (!state.focusedBlockId) {
        return { focusedBlockId: filteredIds[0] ?? null };
      }

      const currentIdx = filteredIds.indexOf(state.focusedBlockId);
      if (currentIdx < filteredIds.length - 1) {
        return { focusedBlockId: filteredIds[currentIdx + 1] ?? null };
      }
      return state;
    }),

  // UI actions
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSearchResults: (results) => set({ searchResults: results })
}));

// Helper functions
function updateCounts(blocks: Block[]): BlockCounts {
  let success = 0;
  let error = 0;
  let running = 0;

  for (const block of blocks) {
    switch (block.status) {
      case 'success':
        success++;
        break;
      case 'error':
        error++;
        break;
      case 'running':
        running++;
        break;
    }
  }

  return { all: blocks.length, success, error, running };
}

function getFilteredBlockIds(blocks: Block[], filter: BlockFilter): string[] {
  if (filter === 'all') {
    return blocks.map((b) => b.id);
  }
  return blocks.filter((b) => b.status === filter).map((b) => b.id);
}
