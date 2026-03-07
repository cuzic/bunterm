/**
 * File Selector Component
 *
 * Dropdown component for selecting files to attach to AI context.
 * Shows files from two sources:
 * - Plans: ~/.claude/plans/*.md
 * - Project: Working directory .md files
 */

import type { FileSource } from '@/daemon/native-terminal/ai/types.js';
import {
  type ContextFileRef,
  useChatStore
} from '@/daemon/native-terminal/client/app/stores/chatStore.js';
import { type FC, useCallback, useEffect, useRef, useState } from 'react';

export interface FileSelectorProps {
  sessionId: string;
  disabled?: boolean;
}

interface FileEntry {
  source: FileSource;
  path: string;
  name: string;
  size: number;
  modifiedAt: string;
}

// API base path
const getApiBasePath = (): string => {
  const config = (window as unknown as { __TERMINAL_UI_CONFIG__?: { base_path?: string } })
    .__TERMINAL_UI_CONFIG__;
  return config?.base_path ?? '/bunterm';
};

// Format relative time
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export const FileSelector: FC<FileSelectorProps> = ({ sessionId, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Chat store
  const addContextFile = useChatStore((s) => s.addContextFile);
  const contextFiles = useChatStore((s) => s.contextFiles);

  // Fetch files when dropdown opens
  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const basePath = getApiBasePath();
      const response = await fetch(
        `${basePath}/api/context-files/recent?session=${encodeURIComponent(sessionId)}&count=15`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch files: ${response.status}`);
      }

      const data = (await response.json()) as { files: FileEntry[] };
      setFiles(data.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Handle dropdown toggle
  const handleToggle = useCallback(() => {
    if (!isOpen) {
      fetchFiles();
    }
    setIsOpen((prev) => !prev);
  }, [isOpen, fetchFiles]);

  // Handle file selection
  const handleSelectFile = useCallback(
    (file: FileEntry) => {
      const contextFile: ContextFileRef = {
        source: file.source,
        path: file.path,
        name: file.name,
        size: file.size,
        modifiedAt: file.modifiedAt
      };
      addContextFile(contextFile);
      setIsOpen(false);
    },
    [addContextFile]
  );

  // Check if file is already selected
  const isFileSelected = useCallback(
    (file: FileEntry): boolean => {
      return contextFiles.some((f) => f.source === file.source && f.path === file.path);
    },
    [contextFiles]
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Separate files by source
  const planFiles = files.filter((f) => f.source === 'plans');
  const projectFiles = files.filter((f) => f.source === 'project');

  return (
    <div ref={containerRef} style={styles.container}>
      {/* Attach button */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        style={{
          ...styles.button,
          ...(disabled ? styles.buttonDisabled : {})
        }}
        title="Attach files to context"
      >
        <span style={styles.icon}>&#128206;</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div style={styles.dropdown}>
          <div style={styles.header}>
            <span style={styles.headerTitle}>Attach Files</span>
            <span style={styles.headerCount}>{contextFiles.length}/5</span>
          </div>

          {isLoading && <div style={styles.loading}>Loading files...</div>}

          {error && <div style={styles.error}>{error}</div>}

          {!isLoading && !error && files.length === 0 && (
            <div style={styles.empty}>No .md files found</div>
          )}

          {!isLoading && !error && files.length > 0 && (
            <div style={styles.sections}>
              {/* Plans section */}
              {planFiles.length > 0 && (
                <div style={styles.section}>
                  <div style={styles.sectionHeader}>
                    <span style={styles.sectionIcon}>&#128203;</span>
                    <span>Plans</span>
                  </div>
                  {planFiles.map((file) => (
                    <button
                      key={`plans:${file.path}`}
                      type="button"
                      onClick={() => handleSelectFile(file)}
                      disabled={isFileSelected(file)}
                      style={{
                        ...styles.fileItem,
                        ...(isFileSelected(file) ? styles.fileItemSelected : {})
                      }}
                    >
                      <span style={styles.fileName}>{file.name}</span>
                      <span style={styles.fileTime}>{formatRelativeTime(file.modifiedAt)}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Project section */}
              {projectFiles.length > 0 && (
                <div style={styles.section}>
                  <div style={styles.sectionHeader}>
                    <span style={styles.sectionIcon}>&#128193;</span>
                    <span>Project</span>
                  </div>
                  {projectFiles.map((file) => (
                    <button
                      key={`project:${file.path}`}
                      type="button"
                      onClick={() => handleSelectFile(file)}
                      disabled={isFileSelected(file)}
                      style={{
                        ...styles.fileItem,
                        ...(isFileSelected(file) ? styles.fileItemSelected : {})
                      }}
                    >
                      <span style={styles.fileName}>{file.path}</span>
                      <span style={styles.fileTime}>{formatRelativeTime(file.modifiedAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative'
  },
  button: {
    padding: '4px 8px',
    fontSize: '14px',
    color: '#888',
    backgroundColor: 'transparent',
    border: '1px solid #444',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  icon: {
    fontSize: '16px'
  },
  dropdown: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    marginBottom: '4px',
    width: '280px',
    maxHeight: '300px',
    backgroundColor: 'rgba(30, 30, 30, 0.98)',
    border: '1px solid #444',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
    overflow: 'hidden'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid #333'
  },
  headerTitle: {
    color: '#fff',
    fontSize: '12px',
    fontWeight: 'bold'
  },
  headerCount: {
    color: '#888',
    fontSize: '11px'
  },
  loading: {
    padding: '16px',
    textAlign: 'center',
    color: '#888',
    fontSize: '12px'
  },
  error: {
    padding: '12px',
    color: '#f44336',
    fontSize: '12px',
    textAlign: 'center'
  },
  empty: {
    padding: '16px',
    textAlign: 'center',
    color: '#666',
    fontSize: '12px'
  },
  sections: {
    overflowY: 'auto',
    maxHeight: '240px'
  },
  section: {
    padding: '4px 0'
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    color: '#aaa',
    fontSize: '11px',
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  sectionIcon: {
    fontSize: '12px'
  },
  fileItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    color: '#ddd',
    fontSize: '12px',
    transition: 'background-color 0.15s'
  },
  fileItemSelected: {
    backgroundColor: 'rgba(58, 134, 255, 0.2)',
    color: '#888',
    cursor: 'default'
  },
  fileName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'monospace'
  },
  fileTime: {
    marginLeft: '8px',
    color: '#666',
    fontSize: '10px',
    flexShrink: 0
  }
};
