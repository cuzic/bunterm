/**
 * BlockManager Tests
 *
 * Tests for client-side block state management, including search functionality.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { type Block, BlockManager } from './BlockManager.js';

// Mock navigator.clipboard for tests
const mockClipboard = {
  writeText: mock(() => Promise.resolve())
};

// @ts-expect-error - mocking global
globalThis.navigator = { clipboard: mockClipboard };

// Mock document for tests
const mockDocument = {
  createElement: mock(() => ({
    value: '',
    style: {},
    select: mock(() => {}),
    remove: mock(() => {})
  })),
  body: {
    appendChild: mock(() => {}),
    removeChild: mock(() => {})
  },
  execCommand: mock(() => {})
};

// @ts-expect-error - mocking global
globalThis.document = mockDocument;

function createTestBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: `block-${Date.now()}-${Math.random()}`,
    command: 'echo "hello world"',
    output: btoa('hello world\n'), // Base64 encoded
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    exitCode: 0,
    cwd: '/home/user',
    status: 'success',
    startLine: 0,
    endLine: 1,
    ...overrides
  };
}

describe('BlockManager', () => {
  let manager: BlockManager;

  beforeEach(() => {
    manager = new BlockManager();
  });

  describe('Basic Operations', () => {
    test('should handle block start', () => {
      const block = createTestBlock({ id: 'test-1', status: 'running' });
      manager.handleBlockStart(block);

      expect(manager.count).toBe(1);
      expect(manager.getBlock('test-1')).toBeDefined();
      expect(manager.hasActiveBlock).toBe(true);
    });

    test('should handle block end', () => {
      const block = createTestBlock({ id: 'test-1', status: 'running' });
      manager.handleBlockStart(block);
      manager.handleBlockEnd('test-1', 0, new Date().toISOString(), 5);

      const endedBlock = manager.getBlock('test-1');
      expect(endedBlock?.status).toBe('success');
      expect(endedBlock?.exitCode).toBe(0);
      expect(manager.hasActiveBlock).toBe(false);
    });

    test('should handle block list', () => {
      const blocks = [
        createTestBlock({ id: 'block-1' }),
        createTestBlock({ id: 'block-2' }),
        createTestBlock({ id: 'block-3' })
      ];
      manager.handleBlockList(blocks);

      expect(manager.count).toBe(3);
      expect(manager.allBlocks).toHaveLength(3);
    });
  });

  describe('Search Functionality', () => {
    beforeEach(() => {
      // Add blocks with different outputs for searching
      const blocks = [
        createTestBlock({
          id: 'block-1',
          command: 'echo "hello"',
          output: btoa('hello world\nthis is a test\n')
        }),
        createTestBlock({
          id: 'block-2',
          command: 'echo "error"',
          output: btoa('ERROR: something went wrong\nfailed to compile\n')
        }),
        createTestBlock({
          id: 'block-3',
          command: 'ls -la',
          output: btoa('file1.txt\nfile2.txt\nhello.js\n')
        })
      ];
      manager.handleBlockList(blocks);
    });

    test('should search for text in block outputs', () => {
      const results = manager.search('hello');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.blockId === 'block-1')).toBe(true);
      expect(results.some((r) => r.blockId === 'block-3')).toBe(true);
    });

    test('should return empty results for non-matching search', () => {
      const results = manager.search('nonexistent');

      expect(results).toHaveLength(0);
    });

    test('should search case-insensitively by default', () => {
      const results = manager.search('ERROR');

      expect(results.some((r) => r.blockId === 'block-2')).toBe(true);
    });

    test('should support case-sensitive search', () => {
      const resultsUpper = manager.search('ERROR', { caseSensitive: true });
      const resultsLower = manager.search('error', { caseSensitive: true });

      expect(resultsUpper.some((r) => r.blockId === 'block-2')).toBe(true);
      expect(resultsLower).toHaveLength(0);
    });

    test('should support regex search', () => {
      const results = manager.search('file\\d+\\.txt', { regex: true });

      expect(results.some((r) => r.blockId === 'block-3')).toBe(true);
      expect(results.filter((r) => r.blockId === 'block-3')).toHaveLength(2);
    });

    test('should search in commands as well', () => {
      const results = manager.search('ls -la', { includeCommand: true });

      expect(results.some((r) => r.blockId === 'block-3')).toBe(true);
    });

    test('should return match positions', () => {
      const results = manager.search('hello');

      const block1Results = results.filter((r) => r.blockId === 'block-1');
      expect(block1Results.length).toBeGreaterThan(0);
      expect(block1Results[0].startIndex).toBeDefined();
      expect(block1Results[0].endIndex).toBeDefined();
    });

    test('should get search result count', () => {
      manager.search('hello');

      expect(manager.searchResultCount).toBeGreaterThan(0);
    });

    test('should navigate to next search result', () => {
      manager.search('file');
      const first = manager.currentSearchResult;

      manager.nextSearchResult();
      const second = manager.currentSearchResult;

      expect(first).not.toEqual(second);
    });

    test('should navigate to previous search result', () => {
      manager.search('file');
      manager.nextSearchResult();
      manager.nextSearchResult();
      const third = manager.currentSearchResult;

      manager.previousSearchResult();
      const second = manager.currentSearchResult;

      expect(third).not.toEqual(second);
    });

    test('should wrap around when navigating search results', () => {
      manager.search('file');
      const count = manager.searchResultCount;

      // Navigate past the end
      for (let i = 0; i < count + 1; i++) {
        manager.nextSearchResult();
      }

      expect(manager.currentSearchResultIndex).toBe(1);
    });

    test('should clear search results', () => {
      manager.search('hello');
      expect(manager.searchResultCount).toBeGreaterThan(0);

      manager.clearSearch();
      expect(manager.searchResultCount).toBe(0);
      expect(manager.currentSearchResult).toBeNull();
    });

    test('should get blocks matching search', () => {
      manager.search('hello');

      const matchingBlocks = manager.blocksMatchingSearch;

      expect(matchingBlocks.length).toBeGreaterThan(0);
      expect(matchingBlocks.every((b) => b.id === 'block-1' || b.id === 'block-3')).toBe(true);
    });
  });

  describe('Selection', () => {
    beforeEach(() => {
      const blocks = [
        createTestBlock({ id: 'block-1' }),
        createTestBlock({ id: 'block-2' }),
        createTestBlock({ id: 'block-3' })
      ];
      manager.handleBlockList(blocks);
    });

    test('should select a single block', () => {
      manager.selectBlock('block-2');

      expect(manager.isSelected('block-2')).toBe(true);
      expect(manager.selectionCount).toBe(1);
    });

    test('should toggle block selection', () => {
      manager.selectBlock('block-1');
      manager.toggleBlockSelection('block-2');

      expect(manager.isSelected('block-1')).toBe(true);
      expect(manager.isSelected('block-2')).toBe(true);
      expect(manager.selectionCount).toBe(2);
    });

    test('should select range of blocks', () => {
      manager.selectBlock('block-1');
      manager.selectBlockRange('block-3');

      expect(manager.selectionCount).toBe(3);
    });

    test('should select all blocks', () => {
      manager.selectAll();

      expect(manager.selectionCount).toBe(3);
    });

    test('should clear selection', () => {
      manager.selectAll();
      manager.clearSelection();

      expect(manager.selectionCount).toBe(0);
    });
  });

  describe('Filter', () => {
    beforeEach(() => {
      const blocks = [
        createTestBlock({ id: 'block-1', status: 'success' }),
        createTestBlock({ id: 'block-2', status: 'error', exitCode: 1 }),
        createTestBlock({ id: 'block-3', status: 'running' })
      ];
      manager.handleBlockList(blocks);
    });

    test('should filter by status', () => {
      manager.filter = 'error';

      expect(manager.filteredBlocks).toHaveLength(1);
      expect(manager.filteredBlocks[0].id).toBe('block-2');
    });

    test('should get block counts', () => {
      const counts = manager.getCounts();

      expect(counts.all).toBe(3);
      expect(counts.success).toBe(1);
      expect(counts.error).toBe(1);
      expect(counts.running).toBe(1);
    });
  });

  describe('Navigation', () => {
    beforeEach(() => {
      const blocks = [
        createTestBlock({ id: 'block-1' }),
        createTestBlock({ id: 'block-2' }),
        createTestBlock({ id: 'block-3' })
      ];
      manager.handleBlockList(blocks);
    });

    test('should focus next block', () => {
      manager.focusFirstBlock();
      expect(manager.focusedBlock).toBe('block-1');

      manager.focusNextBlock();
      expect(manager.focusedBlock).toBe('block-2');
    });

    test('should focus previous block', () => {
      manager.focusLastBlock();
      expect(manager.focusedBlock).toBe('block-3');

      manager.focusPreviousBlock();
      expect(manager.focusedBlock).toBe('block-2');
    });
  });

  describe('Bookmarks', () => {
    beforeEach(() => {
      const blocks = [
        createTestBlock({ id: 'block-1', command: 'important command' }),
        createTestBlock({ id: 'block-2', command: 'another command' }),
        createTestBlock({ id: 'block-3', command: 'third command' })
      ];
      manager.handleBlockList(blocks);
    });

    test('should bookmark a block', () => {
      manager.bookmarkBlock('block-1');

      expect(manager.isBookmarked('block-1')).toBe(true);
      expect(manager.isBookmarked('block-2')).toBe(false);
    });

    test('should unbookmark a block', () => {
      manager.bookmarkBlock('block-1');
      expect(manager.isBookmarked('block-1')).toBe(true);

      manager.unbookmarkBlock('block-1');
      expect(manager.isBookmarked('block-1')).toBe(false);
    });

    test('should toggle bookmark', () => {
      manager.toggleBookmark('block-1');
      expect(manager.isBookmarked('block-1')).toBe(true);

      manager.toggleBookmark('block-1');
      expect(manager.isBookmarked('block-1')).toBe(false);
    });

    test('should get all bookmarked blocks', () => {
      manager.bookmarkBlock('block-1');
      manager.bookmarkBlock('block-3');

      const bookmarked = manager.bookmarkedBlocks;

      expect(bookmarked).toHaveLength(2);
      expect(bookmarked.some((b) => b.id === 'block-1')).toBe(true);
      expect(bookmarked.some((b) => b.id === 'block-3')).toBe(true);
    });

    test('should get bookmark count', () => {
      manager.bookmarkBlock('block-1');
      manager.bookmarkBlock('block-2');

      expect(manager.bookmarkCount).toBe(2);
    });

    test('should clear all bookmarks', () => {
      manager.bookmarkBlock('block-1');
      manager.bookmarkBlock('block-2');
      manager.bookmarkBlock('block-3');

      expect(manager.bookmarkCount).toBe(3);

      manager.clearBookmarks();

      expect(manager.bookmarkCount).toBe(0);
    });

    test('should add bookmark with label', () => {
      manager.bookmarkBlock('block-1', 'Important result');

      expect(manager.isBookmarked('block-1')).toBe(true);
      expect(manager.getBookmarkLabel('block-1')).toBe('Important result');
    });

    test('should update bookmark label', () => {
      manager.bookmarkBlock('block-1', 'First label');
      manager.setBookmarkLabel('block-1', 'Updated label');

      expect(manager.getBookmarkLabel('block-1')).toBe('Updated label');
    });

    test('should navigate to next bookmarked block', () => {
      manager.bookmarkBlock('block-1');
      manager.bookmarkBlock('block-3');

      manager.focusBlock('block-1');
      manager.focusNextBookmark();

      expect(manager.focusedBlock).toBe('block-3');
    });

    test('should navigate to previous bookmarked block', () => {
      manager.bookmarkBlock('block-1');
      manager.bookmarkBlock('block-3');

      manager.focusBlock('block-3');
      manager.focusPreviousBookmark();

      expect(manager.focusedBlock).toBe('block-1');
    });

    test('should wrap around when navigating bookmarks', () => {
      manager.bookmarkBlock('block-1');
      manager.bookmarkBlock('block-3');

      manager.focusBlock('block-3');
      manager.focusNextBookmark();

      expect(manager.focusedBlock).toBe('block-1');
    });

    test('should ignore bookmark operations for non-existent blocks', () => {
      manager.bookmarkBlock('non-existent');

      expect(manager.isBookmarked('non-existent')).toBe(false);
      expect(manager.bookmarkCount).toBe(0);
    });

    test('should get bookmarked block IDs', () => {
      manager.bookmarkBlock('block-1');
      manager.bookmarkBlock('block-3');

      const ids = manager.bookmarkedBlockIds;

      expect(ids).toHaveLength(2);
      expect(ids).toContain('block-1');
      expect(ids).toContain('block-3');
    });
  });

  describe('Block Summary (for Sidebar)', () => {
    beforeEach(() => {
      const blocks = [
        createTestBlock({
          id: 'block-1',
          command: 'echo "hello"',
          status: 'success',
          exitCode: 0,
          startedAt: '2024-01-01T10:00:00Z',
          endedAt: '2024-01-01T10:00:01Z'
        }),
        createTestBlock({
          id: 'block-2',
          command: 'npm test',
          status: 'error',
          exitCode: 1,
          startedAt: '2024-01-01T10:01:00Z',
          endedAt: '2024-01-01T10:01:30Z'
        }),
        createTestBlock({
          id: 'block-3',
          command: 'ls -la /very/long/path/to/directory',
          status: 'running',
          startedAt: '2024-01-01T10:02:00Z'
        })
      ];
      manager.handleBlockList(blocks);
    });

    test('should get block summaries for sidebar', () => {
      const summaries = manager.getBlockSummaries();

      expect(summaries).toHaveLength(3);
      expect(summaries[0].id).toBe('block-1');
      expect(summaries[0].command).toBe('echo "hello"');
      expect(summaries[0].status).toBe('success');
    });

    test('should truncate long commands in summary', () => {
      const summaries = manager.getBlockSummaries({ maxCommandLength: 20 });

      const block3Summary = summaries.find((s) => s.id === 'block-3');
      expect(block3Summary?.truncatedCommand.length).toBeLessThanOrEqual(23); // 20 + "..."
    });

    test('should include duration in summary', () => {
      const summaries = manager.getBlockSummaries();

      const block1Summary = summaries.find((s) => s.id === 'block-1');
      expect(block1Summary?.durationMs).toBe(1000);

      const block2Summary = summaries.find((s) => s.id === 'block-2');
      expect(block2Summary?.durationMs).toBe(30000);
    });

    test('should include bookmark status in summary', () => {
      manager.bookmarkBlock('block-1');

      const summaries = manager.getBlockSummaries();

      const block1Summary = summaries.find((s) => s.id === 'block-1');
      expect(block1Summary?.isBookmarked).toBe(true);

      const block2Summary = summaries.find((s) => s.id === 'block-2');
      expect(block2Summary?.isBookmarked).toBe(false);
    });

    test('should filter summaries by status', () => {
      const errorSummaries = manager.getBlockSummaries({ filterStatus: 'error' });

      expect(errorSummaries).toHaveLength(1);
      expect(errorSummaries[0].id).toBe('block-2');
    });

    test('should filter summaries to bookmarked only', () => {
      manager.bookmarkBlock('block-1');
      manager.bookmarkBlock('block-3');

      const bookmarkedSummaries = manager.getBlockSummaries({ bookmarkedOnly: true });

      expect(bookmarkedSummaries).toHaveLength(2);
      expect(bookmarkedSummaries.some((s) => s.id === 'block-1')).toBe(true);
      expect(bookmarkedSummaries.some((s) => s.id === 'block-3')).toBe(true);
    });

    test('should get recent block summaries', () => {
      const recentSummaries = manager.getBlockSummaries({ limit: 2 });

      expect(recentSummaries).toHaveLength(2);
      // Should be the last 2 blocks
      expect(recentSummaries[0].id).toBe('block-2');
      expect(recentSummaries[1].id).toBe('block-3');
    });

    test('should include index in summary', () => {
      const summaries = manager.getBlockSummaries();

      expect(summaries[0].index).toBe(0);
      expect(summaries[1].index).toBe(1);
      expect(summaries[2].index).toBe(2);
    });
  });

  describe('File Path Detection', () => {
    let manager: BlockManager;

    beforeEach(() => {
      manager = new BlockManager({
        onBlockStart: () => {},
        onBlockEnd: () => {},
        onBlocksLoaded: () => {},
        onSelectionChange: () => {},
        onFilterChange: () => {},
        onFocusChange: () => {}
      });
    });

    test('should detect absolute file paths', () => {
      const output = 'Error at /home/user/project/src/index.ts\nSome text';
      const block = createTestBlock({
        id: 'block-1',
        output: btoa(output)
      });
      manager.handleBlockStart(block);

      const paths = manager.extractFilePaths('block-1');
      expect(paths).toHaveLength(1);
      expect(paths[0].path).toBe('/home/user/project/src/index.ts');
      expect(paths[0].line).toBeUndefined();
      expect(paths[0].column).toBeUndefined();
    });

    test('should detect file paths with line numbers', () => {
      const output = 'Error at /home/user/file.ts:42\nWarning';
      const block = createTestBlock({
        id: 'block-1',
        output: btoa(output)
      });
      manager.handleBlockStart(block);

      const paths = manager.extractFilePaths('block-1');
      expect(paths).toHaveLength(1);
      expect(paths[0].path).toBe('/home/user/file.ts');
      expect(paths[0].line).toBe(42);
      expect(paths[0].column).toBeUndefined();
    });

    test('should detect file paths with line and column numbers', () => {
      const output = 'error: /src/main.rs:15:8 - syntax error';
      const block = createTestBlock({
        id: 'block-1',
        output: btoa(output)
      });
      manager.handleBlockStart(block);

      const paths = manager.extractFilePaths('block-1');
      expect(paths).toHaveLength(1);
      expect(paths[0].path).toBe('/src/main.rs');
      expect(paths[0].line).toBe(15);
      expect(paths[0].column).toBe(8);
    });

    test('should detect relative file paths', () => {
      const output = 'Compiling ./src/components/Button.tsx\n';
      const block = createTestBlock({
        id: 'block-1',
        output: btoa(output)
      });
      manager.handleBlockStart(block);

      const paths = manager.extractFilePaths('block-1');
      expect(paths).toHaveLength(1);
      expect(paths[0].path).toBe('./src/components/Button.tsx');
    });

    test('should detect multiple file paths in output', () => {
      const output = `
src/index.ts:10:5 - error TS2345
src/utils.ts:20:3 - error TS2322
src/types.ts:5:1 - error TS2304
      `;
      const block = createTestBlock({
        id: 'block-1',
        output: btoa(output)
      });
      manager.handleBlockStart(block);

      const paths = manager.extractFilePaths('block-1');
      expect(paths).toHaveLength(3);
      expect(paths[0].path).toBe('src/index.ts');
      expect(paths[0].line).toBe(10);
      expect(paths[0].column).toBe(5);
      expect(paths[1].path).toBe('src/utils.ts');
      expect(paths[2].path).toBe('src/types.ts');
    });

    test('should detect parent directory paths', () => {
      const output = 'Loading ../config/settings.json';
      const block = createTestBlock({
        id: 'block-1',
        output: btoa(output)
      });
      manager.handleBlockStart(block);

      const paths = manager.extractFilePaths('block-1');
      expect(paths).toHaveLength(1);
      expect(paths[0].path).toBe('../config/settings.json');
    });

    test('should return empty array for non-existent block', () => {
      const paths = manager.extractFilePaths('non-existent');
      expect(paths).toHaveLength(0);
    });

    test('should return empty array for output with no file paths', () => {
      const output = 'Hello World! 12345 test@example.com';
      const block = createTestBlock({
        id: 'block-1',
        output: btoa(output)
      });
      manager.handleBlockStart(block);

      const paths = manager.extractFilePaths('block-1');
      expect(paths).toHaveLength(0);
    });

    test('should detect TypeScript/ESLint error format', () => {
      const output = `
/home/user/project/src/App.tsx
  Line 15:10:  'useState' is defined but never used  @typescript-eslint/no-unused-vars
      `;
      const block = createTestBlock({
        id: 'block-1',
        output: btoa(output)
      });
      manager.handleBlockStart(block);

      const paths = manager.extractFilePaths('block-1');
      expect(paths.some((p) => p.path === '/home/user/project/src/App.tsx')).toBe(true);
    });

    test('should include match position in output', () => {
      const output = 'Error in /home/user/file.ts:10 found';
      const block = createTestBlock({
        id: 'block-1',
        output: btoa(output)
      });
      manager.handleBlockStart(block);

      const paths = manager.extractFilePaths('block-1');
      expect(paths).toHaveLength(1);
      expect(paths[0].startIndex).toBeDefined();
      expect(paths[0].endIndex).toBeDefined();
      expect(paths[0].startIndex).toBeLessThan(paths[0].endIndex);
    });

    test('should not detect URLs as file paths', () => {
      const output = 'Visit https://example.com/path/to/page.html';
      const block = createTestBlock({
        id: 'block-1',
        output: btoa(output)
      });
      manager.handleBlockStart(block);

      const paths = manager.extractFilePaths('block-1');
      expect(paths).toHaveLength(0);
    });

    test('should not detect email addresses as file paths', () => {
      const output = 'Contact user@example.com for help';
      const block = createTestBlock({
        id: 'block-1',
        output: btoa(output)
      });
      manager.handleBlockStart(block);

      const paths = manager.extractFilePaths('block-1');
      expect(paths).toHaveLength(0);
    });
  });

  describe('Block Export', () => {
    let manager: BlockManager;

    beforeEach(() => {
      manager = new BlockManager({
        onBlockStart: () => {},
        onBlockEnd: () => {},
        onBlocksLoaded: () => {},
        onSelectionChange: () => {},
        onFilterChange: () => {},
        onFocusChange: () => {}
      });
    });

    test('should export block to markdown with command and output', () => {
      const block = createTestBlock({
        id: 'block-1',
        command: 'echo "hello"',
        output: btoa('hello\n'),
        cwd: '/home/user/project',
        exitCode: 0,
        status: 'success'
      });
      manager.handleBlockStart(block);

      const markdown = manager.exportBlockToMarkdown('block-1');
      expect(markdown).toContain('```bash');
      expect(markdown).toContain('echo "hello"');
      expect(markdown).toContain('```');
      expect(markdown).toContain('hello');
    });

    test('should include directory in export', () => {
      const block = createTestBlock({
        id: 'block-1',
        command: 'pwd',
        output: btoa('/home/user\n'),
        cwd: '/home/user/project'
      });
      manager.handleBlockStart(block);

      const markdown = manager.exportBlockToMarkdown('block-1', { includeDirectory: true });
      expect(markdown).toContain('/home/user/project');
    });

    test('should include exit code for failed commands', () => {
      const block = createTestBlock({
        id: 'block-1',
        command: 'exit 1',
        output: btoa(''),
        exitCode: 1,
        status: 'error'
      });
      manager.handleBlockStart(block);

      const markdown = manager.exportBlockToMarkdown('block-1');
      expect(markdown).toContain('Exit code: 1');
    });

    test('should export command only when specified', () => {
      const block = createTestBlock({
        id: 'block-1',
        command: 'ls -la',
        output: btoa('file1.txt\nfile2.txt\n')
      });
      manager.handleBlockStart(block);

      const markdown = manager.exportBlockToMarkdown('block-1', { commandOnly: true });
      expect(markdown).toContain('ls -la');
      expect(markdown).not.toContain('file1.txt');
    });

    test('should export multiple blocks', () => {
      const block1 = createTestBlock({
        id: 'block-1',
        command: 'cd project'
      });
      const block2 = createTestBlock({
        id: 'block-2',
        command: 'npm install'
      });
      manager.handleBlockStart(block1);
      manager.handleBlockStart(block2);

      const markdown = manager.exportBlocksToMarkdown(['block-1', 'block-2']);
      expect(markdown).toContain('cd project');
      expect(markdown).toContain('npm install');
    });

    test('should export all blocks', () => {
      const block1 = createTestBlock({ id: 'block-1', command: 'cmd1' });
      const block2 = createTestBlock({ id: 'block-2', command: 'cmd2' });
      const block3 = createTestBlock({ id: 'block-3', command: 'cmd3' });
      manager.handleBlockStart(block1);
      manager.handleBlockStart(block2);
      manager.handleBlockStart(block3);

      const markdown = manager.exportAllBlocksToMarkdown();
      expect(markdown).toContain('cmd1');
      expect(markdown).toContain('cmd2');
      expect(markdown).toContain('cmd3');
    });

    test('should return empty string for non-existent block', () => {
      const markdown = manager.exportBlockToMarkdown('non-existent');
      expect(markdown).toBe('');
    });

    test('should include timestamp when specified', () => {
      const block = createTestBlock({
        id: 'block-1',
        command: 'date',
        startedAt: '2024-01-15T10:30:00Z'
      });
      manager.handleBlockStart(block);

      const markdown = manager.exportBlockToMarkdown('block-1', { includeTimestamp: true });
      expect(markdown).toContain('2024-01-15');
    });

    test('should export selected blocks', () => {
      const block1 = createTestBlock({ id: 'block-1', command: 'first' });
      const block2 = createTestBlock({ id: 'block-2', command: 'second' });
      const block3 = createTestBlock({ id: 'block-3', command: 'third' });
      manager.handleBlockStart(block1);
      manager.handleBlockStart(block2);
      manager.handleBlockStart(block3);

      manager.selectBlock('block-1');
      manager.toggleBlockSelection('block-3'); // Add block-3 to selection

      const markdown = manager.exportSelectedBlocksToMarkdown();
      expect(markdown).toContain('first');
      expect(markdown).toContain('third');
      expect(markdown).not.toContain('second');
    });
  });

  describe('Long-running Command Notifications', () => {
    let manager: BlockManager;
    let notifiedBlocks: string[];

    beforeEach(() => {
      notifiedBlocks = [];
      manager = new BlockManager({
        onBlockStart: () => {},
        onBlockEnd: () => {},
        onBlocksLoaded: () => {},
        onSelectionChange: () => {},
        onFilterChange: () => {},
        onFocusChange: () => {},
        onLongRunning: (blockId) => {
          notifiedBlocks.push(blockId);
        }
      });
    });

    test('should calculate running duration for active block', () => {
      const startTime = new Date(Date.now() - 5000).toISOString(); // 5 seconds ago
      const block = createTestBlock({
        id: 'block-1',
        startedAt: startTime,
        status: 'running',
        endedAt: undefined
      });
      manager.handleBlockStart(block);

      const duration = manager.getBlockRunningDuration('block-1');
      expect(duration).toBeGreaterThanOrEqual(4900);
      expect(duration).toBeLessThan(6000);
    });

    test('should return completed duration for finished blocks', () => {
      const startTime = new Date('2024-01-01T10:00:00Z').toISOString();
      const endTime = new Date('2024-01-01T10:00:30Z').toISOString();
      const block = createTestBlock({
        id: 'block-1',
        startedAt: startTime,
        endedAt: endTime,
        status: 'success'
      });
      manager.handleBlockStart(block);

      const duration = manager.getBlockRunningDuration('block-1');
      expect(duration).toBe(30000); // 30 seconds
    });

    test('should set long-running threshold', () => {
      manager.setLongRunningThreshold(10000); // 10 seconds
      expect(manager.longRunningThresholdMs).toBe(10000);
    });

    test('should detect long-running commands', () => {
      manager.setLongRunningThreshold(5000); // 5 seconds

      // Block that started 10 seconds ago
      const startTime = new Date(Date.now() - 10000).toISOString();
      const block = createTestBlock({
        id: 'block-1',
        startedAt: startTime,
        status: 'running',
        endedAt: undefined
      });
      manager.handleBlockStart(block);

      const longRunning = manager.longRunningBlocks;
      expect(longRunning).toHaveLength(1);
      expect(longRunning[0].id).toBe('block-1');
    });

    test('should not include completed blocks in long-running', () => {
      manager.setLongRunningThreshold(5000);

      const block = createTestBlock({
        id: 'block-1',
        startedAt: new Date(Date.now() - 10000).toISOString(),
        endedAt: new Date().toISOString(),
        status: 'success'
      });
      manager.handleBlockStart(block);

      const longRunning = manager.longRunningBlocks;
      expect(longRunning).toHaveLength(0);
    });

    test('should return undefined for non-existent block duration', () => {
      const duration = manager.getBlockRunningDuration('non-existent');
      expect(duration).toBeUndefined();
    });

    test('should get list of running blocks', () => {
      const runningBlock = createTestBlock({
        id: 'block-1',
        status: 'running',
        endedAt: undefined
      });
      const completedBlock = createTestBlock({
        id: 'block-2',
        status: 'success'
      });
      manager.handleBlockStart(runningBlock);
      manager.handleBlockStart(completedBlock);

      const running = manager.runningBlocks;
      expect(running).toHaveLength(1);
      expect(running[0].id).toBe('block-1');
    });

    test('should format duration as human-readable string', () => {
      expect(manager.formatDuration(500)).toBe('0s');
      expect(manager.formatDuration(5000)).toBe('5s');
      expect(manager.formatDuration(65000)).toBe('1m 5s');
      expect(manager.formatDuration(3665000)).toBe('1h 1m');
    });
  });
});
