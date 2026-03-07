/**
 * Split Pane Component
 *
 * Resizable split layout using react-resizable-panels.
 */

import type { FC, ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

export interface SplitPaneProps {
  /** Left pane content (terminal) */
  left: ReactNode;
  /** Right pane content (AI chat) */
  right: ReactNode;
  /** Initial size of left pane (percentage, default: 70) */
  initialLeftSize?: number;
  /** Minimum size of left pane (percentage, default: 30) */
  minLeftSize?: number;
  /** Maximum size of left pane (percentage, default: 90) */
  maxLeftSize?: number;
  /** Whether the right pane is visible */
  rightVisible?: boolean;
  /** Callback when pane sizes change */
  onResize?: (leftSize: number) => void;
}

export const SplitPane: FC<SplitPaneProps> = ({
  left,
  right,
  initialLeftSize = 70,
  minLeftSize = 30,
  maxLeftSize = 90,
  rightVisible = true,
  onResize
}) => {
  // Handle resize
  const handleResize = (sizes: number[]) => {
    if (sizes[0] !== undefined && onResize) {
      onResize(sizes[0]);
    }
  };

  // If right pane is hidden, just render left
  if (!rightVisible) {
    return (
      <div style={styles.container}>
        <div style={styles.fullPane}>{left}</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <PanelGroup direction="horizontal" onLayout={handleResize} autoSaveId="bunterm-split">
        {/* Left pane (Terminal) */}
        <Panel defaultSize={initialLeftSize} minSize={minLeftSize} maxSize={maxLeftSize} order={1}>
          <div style={styles.pane}>{left}</div>
        </Panel>

        {/* Resize handle */}
        <PanelResizeHandle style={styles.resizeHandle}>
          <div style={styles.resizeHandleInner} />
        </PanelResizeHandle>

        {/* Right pane (AI Chat) */}
        <Panel
          defaultSize={100 - initialLeftSize}
          minSize={100 - maxLeftSize}
          maxSize={100 - minLeftSize}
          order={2}
        >
          <div style={styles.pane}>{right}</div>
        </Panel>
      </PanelGroup>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    overflow: 'hidden'
  },
  fullPane: {
    width: '100%',
    height: '100%'
  },
  pane: {
    width: '100%',
    height: '100%',
    overflow: 'hidden'
  },
  resizeHandle: {
    width: '4px',
    backgroundColor: '#1e1e1e',
    cursor: 'col-resize',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s'
  },
  resizeHandleInner: {
    width: '2px',
    height: '40px',
    backgroundColor: '#444',
    borderRadius: '1px',
    transition: 'background-color 0.2s'
  }
};
