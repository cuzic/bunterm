/**
 * useBlockContextBridge Hook
 *
 * Listens for custom events from terminal-client.ts and adds blocks to AI context.
 * This bridges the vanilla JS terminal client with the React AI Chat app.
 */

import { useChatStore } from '@/daemon/native-terminal/client/app/stores/chatStore.js';
import { useEffect } from 'react';

/** Event detail from terminal-client */
interface BlockContextEventDetail {
  type: 'command' | 'claude';
  blockId: string;
  content: string;
  metadata: Record<string, unknown>;
}

/**
 * Hook to listen for block context events from terminal-client
 */
export function useBlockContextBridge(): void {
  const addContextBlock = useChatStore((s) => s.addContextBlock);

  useEffect(() => {
    const handleAddContext = (event: Event) => {
      const customEvent = event as CustomEvent<BlockContextEventDetail>;
      const { blockId, type, content, metadata } = customEvent.detail;

      console.log('[useBlockContextBridge] Received add-context event:', {
        blockId,
        type,
        contentLength: content.length,
        metadata
      });

      // Add block to context
      addContextBlock(blockId);

      // Store the content and metadata for later use
      // We could extend the store to include this, but for now we'll use
      // a simple global registry that the AI request can access
      registerBlockContent(blockId, {
        type,
        content,
        metadata
      });
    };

    document.addEventListener('bunterm:add-context', handleAddContext);

    return () => {
      document.removeEventListener('bunterm:add-context', handleAddContext);
    };
  }, [addContextBlock]);
}

/** Block content registry for AI requests */
interface BlockContentEntry {
  type: 'command' | 'claude';
  content: string;
  metadata: Record<string, unknown>;
}

const blockContentRegistry = new Map<string, BlockContentEntry>();

/**
 * Register block content for AI context
 */
export function registerBlockContent(blockId: string, entry: BlockContentEntry): void {
  blockContentRegistry.set(blockId, entry);
}

/**
 * Get block content for AI context
 */
export function getBlockContent(blockId: string): BlockContentEntry | undefined {
  return blockContentRegistry.get(blockId);
}

/**
 * Get all registered block contents
 */
export function getAllBlockContents(blockIds: string[]): BlockContentEntry[] {
  return blockIds
    .map((id) => blockContentRegistry.get(id))
    .filter((entry): entry is BlockContentEntry => entry !== undefined);
}

/**
 * Clear block content registry
 */
export function clearBlockContents(): void {
  blockContentRegistry.clear();
}

/**
 * Remove specific block from registry
 */
export function removeBlockContent(blockId: string): void {
  blockContentRegistry.delete(blockId);
}
