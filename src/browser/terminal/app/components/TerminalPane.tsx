/**
 * Terminal Pane Component
 *
 * Wraps xterm.js terminal with React integration.
 */

import { useTerminal } from '@/daemon/native-terminal/client/app/hooks/useTerminal.js';
import { type FC, useEffect } from 'react';
import { BlockOverlay } from './BlockOverlay.js';

export interface TerminalPaneProps {
  wsUrl: string;
  sessionName: string;
  fontSize?: number;
  scrollback?: number;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: string) => void;
}

export const TerminalPane: FC<TerminalPaneProps> = ({
  wsUrl,
  sessionName,
  fontSize = 14,
  scrollback = 10000,
  onConnected,
  onDisconnected,
  onError
}) => {
  const { containerRef, terminal, isConnected, isLoading, error, connect, fit, sendInput, focus } =
    useTerminal({
      wsUrl,
      fontSize,
      scrollback,
      autoReconnect: true
    });

  // Connect on mount
  useEffect(() => {
    connect().catch((err) => {
      console.error('[TerminalPane] Connection failed:', err);
    });
  }, [connect]);

  // Callback effects
  useEffect(() => {
    if (isConnected) {
      onConnected?.();
    } else {
      onDisconnected?.();
    }
  }, [isConnected, onConnected, onDisconnected]);

  useEffect(() => {
    if (error) {
      onError?.(error);
    }
  }, [error, onError]);

  // Handle resize using ResizeObserver (works with SplitPane)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Debounced fit function to avoid excessive calls
    let fitTimeout: number | null = null;
    const debouncedFit = () => {
      if (fitTimeout) {
        window.clearTimeout(fitTimeout);
      }
      fitTimeout = window.setTimeout(() => {
        fit();
        fitTimeout = null;
      }, 50);
    };

    // Use ResizeObserver to detect container size changes
    const resizeObserver = new ResizeObserver(() => {
      debouncedFit();
    });

    resizeObserver.observe(container);

    // Also observe parent container for toolbar visibility changes
    const parent = container.parentElement;
    if (parent) {
      resizeObserver.observe(parent);
    }

    // Also listen for window resize as fallback
    const handleWindowResize = () => debouncedFit();
    window.addEventListener('resize', handleWindowResize);

    // Handle orientation change on mobile
    const handleOrientationChange = () => {
      // Delay to allow layout to settle
      setTimeout(debouncedFit, 100);
    };
    window.addEventListener('orientationchange', handleOrientationChange);

    // Handle Visual Viewport changes (mobile keyboard)
    const visualViewport = window.visualViewport;
    const handleVisualViewportResize = () => {
      debouncedFit();
    };
    if (visualViewport) {
      visualViewport.addEventListener('resize', handleVisualViewportResize);
      visualViewport.addEventListener('scroll', handleVisualViewportResize);
    }

    // Listen for toolbar visibility changes via MutationObserver
    const tuiElement = document.getElementById('tui');
    let mutationObserver: MutationObserver | null = null;
    if (tuiElement) {
      mutationObserver = new MutationObserver(() => {
        // Delay fit() to allow CSS transitions to complete
        setTimeout(debouncedFit, 50);
      });
      mutationObserver.observe(tuiElement, {
        attributes: true,
        attributeFilter: ['class']
      });
    }

    return () => {
      if (fitTimeout) {
        window.clearTimeout(fitTimeout);
      }
      resizeObserver.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      if (visualViewport) {
        visualViewport.removeEventListener('resize', handleVisualViewportResize);
        visualViewport.removeEventListener('scroll', handleVisualViewportResize);
      }
    };
  }, [fit, containerRef]);

  return (
    <div class="terminal-pane" style={styles.container}>
      {/* Loading overlay */}
      {isLoading && (
        <div style={styles.loading}>
          <span>Connecting to {sessionName}...</span>
        </div>
      )}

      {/* Error overlay */}
      {error && !isLoading && (
        <div style={styles.error}>
          <span>Connection error: {error}</span>
        </div>
      )}

      {/* Terminal container */}
      <div ref={containerRef} style={styles.terminal} onClick={() => focus()} />

      {/* Block overlay (rendered on top of terminal) */}
      {terminal && <BlockOverlay terminalElement={containerRef.current} />}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100%',
    backgroundColor: '#1e1e1e',
    overflow: 'hidden'
  },
  terminal: {
    width: '100%',
    height: '100%'
  },
  loading: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: '#888',
    fontSize: '14px',
    zIndex: 10
  },
  error: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: '#f44336',
    fontSize: '14px',
    textAlign: 'center',
    padding: '20px',
    zIndex: 10
  }
};
