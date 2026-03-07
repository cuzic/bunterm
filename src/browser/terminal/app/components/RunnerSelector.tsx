/**
 * Runner Selector Component
 *
 * Dropdown for selecting AI runner.
 */

import type { RunnerName, RunnerStatus } from '@/daemon/native-terminal/ai/types.js';
import { useChatStore } from '@/daemon/native-terminal/client/app/stores/chatStore.js';
import { type FC, useCallback, useEffect, useState } from 'react';

export interface RunnerSelectorProps {
  disabled?: boolean;
}

export const RunnerSelector: FC<RunnerSelectorProps> = ({ disabled = false }) => {
  const selectedRunner = useChatStore((s) => s.selectedRunner);
  const availableRunners = useChatStore((s) => s.availableRunners);
  const setSelectedRunner = useChatStore((s) => s.setSelectedRunner);
  const fetchRunners = useChatStore((s) => s.fetchRunners);

  const [isOpen, setIsOpen] = useState(false);

  // Fetch runners on mount
  useEffect(() => {
    fetchRunners();
  }, [fetchRunners]);

  // Handle selection
  const handleSelect = useCallback(
    (runner: RunnerName) => {
      setSelectedRunner(runner);
      setIsOpen(false);
    },
    [setSelectedRunner]
  );

  // Get display name for runner
  const getRunnerDisplay = (name: RunnerName, status?: RunnerStatus): string => {
    const displayNames: Record<RunnerName, string> = {
      claude: 'Claude',
      codex: 'Codex',
      gemini: 'Gemini',
      auto: 'Auto',
      disabled: 'Disabled'
    };

    const display = displayNames[name] ?? name;

    if (status) {
      if (!status.available) return `${display} (Not installed)`;
      if (!status.authenticated) return `${display} (Not authenticated)`;
    }

    return display;
  };

  // Get status icon
  const getStatusIcon = (status?: RunnerStatus): string => {
    if (!status) return '◯';
    if (!status.available) return '✗';
    if (!status.authenticated) return '⚠';
    return '✓';
  };

  // Get best available runner for auto mode
  const getBestRunner = (): string => {
    const preferredOrder: RunnerName[] = ['claude', 'gemini', 'codex'];
    for (const name of preferredOrder) {
      const status = availableRunners.find((r) => r.name === name);
      if (status?.available && status?.authenticated) {
        return getRunnerDisplay(name);
      }
    }
    return 'None available';
  };

  return (
    <div style={styles.container}>
      {/* Selected runner button */}
      <button
        type="button"
        style={{
          ...styles.button,
          ...(disabled ? styles.buttonDisabled : {})
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span style={styles.label}>
          {selectedRunner === 'auto'
            ? `Auto (${getBestRunner()})`
            : getRunnerDisplay(
                selectedRunner,
                availableRunners.find((r) => r.name === selectedRunner)
              )}
        </span>
        <span style={styles.arrow}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div style={styles.dropdown}>
          {/* Auto option */}
          <button
            type="button"
            style={{
              ...styles.option,
              ...(selectedRunner === 'auto' ? styles.optionSelected : {})
            }}
            onClick={() => handleSelect('auto')}
          >
            <span style={styles.optionIcon}>◎</span>
            <span style={styles.optionLabel}>Auto</span>
            <span style={styles.optionDesc}>Best available</span>
          </button>

          {/* Divider */}
          <div style={styles.divider} />

          {/* Available runners */}
          {availableRunners.map((runner) => (
            <button
              key={runner.name}
              type="button"
              style={{
                ...styles.option,
                ...(selectedRunner === runner.name ? styles.optionSelected : {}),
                ...(!runner.available || !runner.authenticated ? styles.optionDisabled : {})
              }}
              onClick={() => runner.available && runner.authenticated && handleSelect(runner.name)}
              disabled={!runner.available || !runner.authenticated}
            >
              <span
                style={{
                  ...styles.optionIcon,
                  color: runner.available && runner.authenticated ? '#4caf50' : '#888'
                }}
              >
                {getStatusIcon(runner)}
              </span>
              <span style={styles.optionLabel}>{getRunnerDisplay(runner.name)}</span>
              <span style={styles.optionDesc}>
                {runner.available
                  ? runner.authenticated
                    ? (runner.version ?? '')
                    : 'Not authenticated'
                  : 'Not installed'}
              </span>
            </button>
          ))}
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
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    fontSize: '12px',
    color: '#ccc',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid #444',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  label: {
    flex: 1
  },
  arrow: {
    fontSize: '10px',
    color: '#888'
  },
  dropdown: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    marginBottom: '4px',
    backgroundColor: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: '4px',
    boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.3)',
    zIndex: 1000,
    overflow: 'hidden'
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 10px',
    fontSize: '12px',
    color: '#ccc',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left'
  },
  optionSelected: {
    backgroundColor: 'rgba(66, 165, 245, 0.2)'
  },
  optionDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  optionIcon: {
    width: '16px',
    textAlign: 'center'
  },
  optionLabel: {
    flex: 1,
    fontWeight: 500
  },
  optionDesc: {
    color: '#888',
    fontSize: '11px'
  },
  divider: {
    height: '1px',
    backgroundColor: '#444',
    margin: '4px 0'
  }
};
