/**
 * AI Chat App
 *
 * Root component for the AI Chat React application.
 * Provides split pane layout with terminal and AI chat.
 */

import { type FC, useCallback, useEffect, useState } from 'react';
import { AIChatPane } from './components/AIChatPane.js';
import { SplitPane } from './components/SplitPane.js';
import { TerminalPane } from './components/TerminalPane.js';
import { useBlockContextBridge } from './hooks/useBlockContextBridge.js';
import { useBlockStore } from './stores/blockStore.js';
import { useChatStore } from './stores/chatStore.js';

declare global {
  interface Window {
    __TERMINAL_UI_CONFIG__?: {
      base_path?: string;
      sessionName?: string;
      sessionPath?: string;
      isShared?: boolean;
      isNativeTerminal?: boolean;
    };
    __TERMINAL_CLIENT__?: {
      sendInput: (data: string) => void;
    };
  }
}

export interface AppProps {
  /** Session name */
  sessionName?: string;
  /** WebSocket URL */
  wsUrl?: string;
  /** Whether AI pane is initially visible */
  aiPaneVisible?: boolean;
}

// Detect mobile device
const isMobileDevice = (): boolean => {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768
  );
};

export const App: FC<AppProps> = ({
  sessionName: propSessionName,
  wsUrl: propWsUrl,
  aiPaneVisible: initialAiPaneVisible
}) => {
  // Get config from window
  const config = window.__TERMINAL_UI_CONFIG__ ?? {};
  const sessionName = propSessionName ?? config.sessionName ?? 'terminal';
  const sessionPath = config.sessionPath ?? `/bunterm/${sessionName}`;

  // Determine WebSocket URL
  const wsUrl =
    propWsUrl ??
    (() => {
      const loc = window.location;
      const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${loc.host}${sessionPath}/ws`;
    })();

  // Default: hide AI pane on mobile
  const defaultAiPaneVisible = initialAiPaneVisible ?? !isMobileDevice();

  // State
  const [aiPaneVisible, setAiPaneVisible] = useState(defaultAiPaneVisible);
  const [leftPaneSize, setLeftPaneSize] = useState(isMobileDevice() ? 100 : 70);

  // Block store
  const focusBlock = useBlockStore((s) => s.focusBlock);

  // Chat store
  const isOpen = useChatStore((s) => s.isOpen);
  const setOpen = useChatStore((s) => s.setOpen);

  // Bridge for terminal-client block context events
  useBlockContextBridge();

  // Sync AI pane visibility with chat store
  useEffect(() => {
    setAiPaneVisible(isOpen);
  }, [isOpen]);

  // Toggle AI pane
  const toggleAiPane = useCallback(() => {
    setAiPaneVisible((prev) => !prev);
    setOpen(!aiPaneVisible);
  }, [aiPaneVisible, setOpen]);

  // Handle citation click (jump to block in terminal)
  const handleCitationClick = useCallback(
    (blockId: string) => {
      focusBlock(blockId);
      // TODO: Scroll terminal to block position
    },
    [focusBlock]
  );

  // Handle command execution
  const handleCommandExecute = useCallback((command: string) => {
    const client = window.__TERMINAL_CLIENT__;
    if (client) {
      // Send command to terminal without Enter (so user can review)
      client.sendInput(command);
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(command).catch(console.error);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = /Mac/.test(navigator.platform);
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl + J: Toggle AI pane
      if (cmdOrCtrl && e.key === 'j') {
        e.preventDefault();
        toggleAiPane();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleAiPane]);

  return (
    <div style={styles.container}>
      <SplitPane
        left={
          <TerminalPane
            wsUrl={wsUrl}
            sessionName={sessionName}
            onConnected={() => console.log('[App] Terminal connected')}
            onError={(error) => console.error('[App] Terminal error:', error)}
          />
        }
        right={
          <AIChatPane
            sessionId={sessionName}
            sessionName={sessionName}
            onCitationClick={handleCitationClick}
            onCommandExecute={handleCommandExecute}
          />
        }
        initialLeftSize={leftPaneSize}
        rightVisible={aiPaneVisible}
        onResize={setLeftPaneSize}
      />

      {/* Toggle button (visible when AI pane is hidden) */}
      {!aiPaneVisible && (
        <button
          type="button"
          style={styles.toggleButton}
          onClick={toggleAiPane}
          title="Open AI Chat (⌘J)"
        >
          💬
        </button>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100vw',
    height: '100vh',
    backgroundColor: '#1e1e1e',
    overflow: 'hidden'
  },
  toggleButton: {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: '48px',
    height: '48px',
    fontSize: '24px',
    backgroundColor: '#3a86ff',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
};

// Export default for easier imports
export default App;
