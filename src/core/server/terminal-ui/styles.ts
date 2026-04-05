/**
 * Terminal Toolbar CSS Styles
 */

export const terminalUiStyles = `
/* CSS Variables for layout (managed by LayoutManager.ts) */
:root {
  --vvh: 100vh;      /* Visual viewport height - updated by JS */
  --tui-h: 0px;      /* Toolbar height - updated by JS */
  --vv-offset-top: 0px; /* Visual viewport offset (iOS keyboard) */
}

#tui {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #1e1e1e;
  border-top: 2px solid #007acc;
  padding: 18px 8px 8px 8px;
  z-index: 10000;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  box-shadow: 0 -2px 10px rgba(0,0,0,0.3);
}

#tui.hidden {
  display: none;
}

#tui-buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
  align-items: flex-end;
}

.tui-group {
  display: flex;
  gap: 4px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  position: relative;
  flex-wrap: wrap;
}

.tui-group::before {
  content: attr(data-label);
  position: absolute;
  top: -14px;
  left: 6px;
  font-size: 10px;
  color: #888;
  white-space: nowrap;
}

.tui-group-end {
  margin-left: auto;
}

.tui-group-end::before {
  display: none;
}

#tui-buttons button {
  background: #3a3a3a;
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  padding: 8px 12px;
  min-height: 40px;
  min-width: 44px;
  touch-action: manipulation;
  flex-shrink: 0;
}

#tui-buttons button:hover, #tui-buttons button:active {
  background: #4a4a4a;
}

#tui-buttons button.active {
  background: #007acc;
  border-color: #005a9e;
}

#tui-buttons button.modifier {
  background: #2d2d2d;
  font-weight: bold;
}

#tui-buttons button.modifier.active {
  background: #d9534f;
  border-color: #c9302c;
}

#tui-send {
  background: #007acc !important;
  border-color: #005a9e !important;
  font-weight: bold;
}

#tui-send:hover, #tui-send:active {
  background: #005a9e !important;
}

#tui-run {
  background: #28a745 !important;
  border-color: #1e7e34 !important;
  font-weight: bold;
}

#tui-run:hover, #tui-run:active {
  background: #1e7e34 !important;
}

#tui-auto.active {
  background: #f0ad4e !important;
  border-color: #eea236 !important;
  color: #000;
}

#tui-scroll.active {
  background: #17a2b8 !important;
  border-color: #138496 !important;
}

#tui-input-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

#tui-buttons-toggle {
  background: #3a3a3a;
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  padding: 8px 10px;
  min-height: 40px;
  min-width: 36px;
  touch-action: manipulation;
  flex-shrink: 0;
}

#tui-buttons-toggle:hover, #tui-buttons-toggle:active {
  background: #4a4a4a;
}

/* Hide buttons when collapsed */
#tui.buttons-collapsed #tui-buttons {
  display: none;
}

#tui.buttons-collapsed #tui-buttons-toggle {
  background: #007acc;
  border-color: #005a9e;
}

#tui-input {
  flex: 1;
  background: #2d2d2d;
  border: 1px solid #555;
  border-radius: 8px;
  color: #fff;
  font-family: monospace;
  font-size: 16px;
  padding: 12px;
  outline: none;
  resize: none;
  min-height: 44px;
  max-height: 120px;
  line-height: 1.4;
}

#tui-input:focus {
  border-color: #007acc;
}

#tui-input::placeholder {
  color: #888;
}

/* Vertical tab toggle button on right edge */
#tui-toggle {
  position: fixed;
  top: 65%;
  right: 0;
  transform: translateY(-50%);
  background: rgba(0, 122, 204, 0.85);
  border: none;
  border-radius: 8px 0 0 8px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  width: 28px;
  padding: 12px 4px;
  z-index: 10001;
  touch-action: manipulation;
  box-shadow: -2px 0 8px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: all 0.2s ease;
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

#tui-toggle:hover, #tui-toggle:active {
  background: rgba(0, 90, 158, 0.95);
  width: 32px;
  box-shadow: -3px 0 12px rgba(0,0,0,0.3);
}

.tui-toggle-icon {
  font-size: 18px;
  writing-mode: horizontal-tb;
}

.tui-toggle-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

/* When toolbar is hidden, make tab more prominent */
#tui.hidden ~ #tui-toggle {
  background: linear-gradient(180deg, #007acc 0%, #28a745 100%);
  animation: tui-tab-pulse 2s ease-in-out infinite;
}

#tui.hidden ~ #tui-toggle .tui-toggle-label {
  display: block;
}

@keyframes tui-tab-pulse {
  0%, 100% {
    box-shadow: -2px 0 8px rgba(0, 122, 204, 0.3);
  }
  50% {
    box-shadow: -3px 0 16px rgba(0, 122, 204, 0.5), 0 0 8px rgba(40, 167, 69, 0.3);
  }
}

/* When toolbar is visible, make tab subtle */
#tui:not(.hidden) ~ #tui-toggle {
  background: rgba(0, 122, 204, 0.6);
  animation: none;
}

#tui:not(.hidden) ~ #tui-toggle .tui-toggle-label {
  display: none;
}

/* Adjust layout when toolbar is visible - using CSS variables from LayoutManager */
html:has(#tui:not(.hidden)) {
  height: 100% !important;
  overflow: hidden !important;
}

body:has(#tui:not(.hidden)) {
  position: fixed !important;
  top: var(--vv-offset-top, 0px) !important;
  left: 0 !important;
  right: 0 !important;
  height: var(--vvh) !important;
  max-height: var(--vvh) !important;
  overflow: hidden !important;
  box-sizing: border-box;
  padding-bottom: var(--tui-h) !important;
}

body:has(#tui:not(.hidden)) .terminal,
body:has(#tui:not(.hidden)) #terminal,
body:has(#tui:not(.hidden)) .terminal-pane {
  height: calc(var(--vvh) - var(--tui-h)) !important;
}

body:has(#tui:not(.hidden)) .xterm {
  height: 100% !important;
}

body:has(#tui:not(.hidden)) .xterm-viewport,
body:has(#tui:not(.hidden)) .xterm-screen {
  height: 100% !important;
}

/* Adjust layout when toolbar is hidden - still use visualViewport for mobile keyboard */
html:has(#tui.hidden) {
  height: 100% !important;
  overflow: hidden !important;
}

body:has(#tui.hidden) {
  position: fixed !important;
  top: var(--vv-offset-top, 0px) !important;
  left: 0 !important;
  right: 0 !important;
  height: var(--vvh) !important;
  max-height: var(--vvh) !important;
  overflow: hidden !important;
  box-sizing: border-box;
}

body:has(#tui.hidden) .terminal,
body:has(#tui.hidden) #terminal,
body:has(#tui.hidden) .terminal-pane {
  height: var(--vvh) !important;
}

body:has(#tui.hidden) .xterm {
  height: 100% !important;
}

body:has(#tui.hidden) .xterm-viewport,
body:has(#tui.hidden) .xterm-screen {
  height: 100% !important;
}

/* Note: minimized mode height is now handled automatically by --tui-h variable */

/* Minimized mode - compact toolbar with input only */
#tui.minimized #tui-buttons {
  display: none;
}

#tui.minimized {
  padding: 4px 8px;
}

#tui-minimize {
  background: #555 !important;
  border-color: #666 !important;
  font-size: 10px;
  padding: 4px 8px;
  min-width: 32px;
  min-height: 32px;
  transition: transform 0.2s ease;
}

.tui-minimize-icon {
  display: inline-block;
  transition: transform 0.3s ease;
}

/* When minimized, rotate icon and change color to indicate expand */
#tui.minimized #tui-minimize {
  background: #28a745 !important;
  border-color: #1e7e34 !important;
}

#tui.minimized #tui-minimize .tui-minimize-icon {
  transform: rotate(180deg);
}

/* Onboarding tooltip */
#tui-onboarding {
  position: fixed;
  bottom: 90px;
  right: 16px;
  background: #333;
  border: 1px solid #007acc;
  border-radius: 8px;
  padding: 12px 16px;
  color: #fff;
  font-size: 13px;
  max-width: 280px;
  z-index: 10002;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  line-height: 1.5;
  pointer-events: none;
}

#tui-onboarding::after {
  content: '';
  position: absolute;
  bottom: -8px;
  right: 24px;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 8px solid #333;
}

#tui-onboarding-close {
  position: absolute;
  top: 4px;
  right: 8px;
  background: none;
  border: none;
  color: #888;
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
  pointer-events: auto;
}

#tui-onboarding-close:hover {
  color: #fff;
}

#tui-onboarding ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

#tui-onboarding li {
  margin: 4px 0;
}

#tui-onboarding code {
  background: #444;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

/* Mobile-only elements (hidden on desktop) */
.tui-mobile-only {
  display: none;
}


/* Mobile optimizations */
@media (max-width: 768px) {
  /* Show mobile-only elements */
  .tui-mobile-only {
    display: inline-flex !important;
  }

  #tui {
    padding: 6px;
  }

  #tui-buttons {
    gap: 4px;
    margin-bottom: 6px;
  }

  .tui-group {
    padding: 3px 4px;
    gap: 3px;
  }

  .tui-group::before {
    display: none;
  }

  #tui-buttons button {
    font-size: 12px;
    padding: 6px 10px;
    min-height: 36px;
    min-width: 40px;
  }

  #tui-input {
    font-size: 16px;
    padding: 10px;
  }

  /* Mobile: slightly larger tab for easier touch */
  #tui-toggle {
    width: 32px;
    padding: 16px 6px;
  }

  .tui-toggle-icon {
    font-size: 20px;
  }

  .tui-toggle-label {
    font-size: 13px;
  }

  #tui-toggle:hover, #tui-toggle:active {
    width: 36px;
  }

  /* Mobile: Layout now uses CSS variables from LayoutManager */
  /* No fixed values needed - --vvh and --tui-h handle everything */

  #tui-onboarding {
    left: 16px;
    right: 16px;
    max-width: none;
  }

  #tui-search-bar {
    padding: 6px;
  }

  #tui-search-input {
    font-size: 14px;
    padding: 8px 10px;
  }
}

/* Search bar styles */
#tui-search-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: #1e1e1e;
  border-bottom: 2px solid #007acc;
  padding: 8px 12px;
  z-index: 10000;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  display: flex;
  gap: 8px;
  align-items: center;
}

#tui-search-bar.hidden {
  display: none;
}

#tui-search-input {
  flex: 1;
  background: #2d2d2d;
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  font-family: monospace;
  font-size: 14px;
  padding: 8px 12px;
  outline: none;
  min-width: 100px;
}

#tui-search-input:focus {
  border-color: #007acc;
}

#tui-search-input::placeholder {
  color: #888;
}

#tui-search-count {
  color: #888;
  font-size: 12px;
  white-space: nowrap;
  min-width: 50px;
  text-align: center;
}

#tui-search-bar button {
  background: #3a3a3a;
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  padding: 6px 10px;
  min-height: 32px;
  min-width: 32px;
  touch-action: manipulation;
}

#tui-search-bar button:hover,
#tui-search-bar button:active {
  background: #4a4a4a;
}

#tui-search-bar button.modifier {
  background: #2d2d2d;
  font-weight: bold;
}

#tui-search-bar button.modifier.active {
  background: #007acc;
  border-color: #005a9e;
}

#tui-search-close {
  color: #888;
}

#tui-search-close:hover {
  color: #fff;
}

/* Visual bell effect */
.xterm.bell-flash {
  animation: bell-flash 100ms ease-out;
}

@keyframes bell-flash {
  0% { filter: brightness(1); }
  50% { filter: brightness(1.5); }
  100% { filter: brightness(1); }
}

/* Share modal styles */
#tui-share-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.7);
  z-index: 10010;
  display: flex;
  align-items: center;
  justify-content: center;
}

#tui-share-modal.hidden {
  display: none;
}

#tui-share-modal-content {
  background: #2d2d2d;
  border-radius: 12px;
  color: #e0e0e0;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}

#tui-share-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #444;
  font-size: 16px;
  font-weight: bold;
}

#tui-share-modal-close {
  background: none;
  border: none;
  color: #888;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
}

#tui-share-modal-close:hover {
  color: #fff;
}

#tui-share-modal-body {
  padding: 16px;
}

#tui-share-expiry {
  margin-bottom: 16px;
}

#tui-share-expiry > label {
  display: block;
  margin-bottom: 8px;
  color: #aaa;
  font-size: 14px;
}

#tui-share-expiry-options {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

#tui-share-expiry-options label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
}

#tui-share-expiry-options input[type="radio"] {
  accent-color: #007acc;
}

#tui-share-create {
  width: 100%;
  background: #007acc;
  border: none;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  font-size: 15px;
  font-weight: bold;
  padding: 12px 16px;
  transition: background 0.2s;
}

#tui-share-create:hover {
  background: #005a9e;
}

#tui-share-create:disabled {
  background: #555;
  cursor: not-allowed;
}

#tui-share-create.hidden {
  display: none;
}

#tui-share-result {
  margin-top: 16px;
}

#tui-share-result.hidden {
  display: none;
}

#tui-share-url {
  width: 100%;
  background: #1e1e1e;
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  font-family: monospace;
  font-size: 13px;
  padding: 10px;
  margin-bottom: 12px;
  box-sizing: border-box;
}

#tui-share-url:focus {
  outline: none;
  border-color: #007acc;
}

#tui-share-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

#tui-share-actions button {
  flex: 1;
  background: #3a3a3a;
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  padding: 10px 16px;
  transition: background 0.2s;
}

#tui-share-actions button:hover {
  background: #4a4a4a;
}

#tui-share-warning {
  background: rgba(255, 193, 7, 0.15);
  border: 1px solid rgba(255, 193, 7, 0.3);
  border-radius: 6px;
  color: #ffc107;
  font-size: 12px;
  padding: 10px;
  text-align: center;
}

/* Mobile adjustments for share modal */
@media (max-width: 768px) {
  #tui-share-modal-content {
    max-width: none;
    width: calc(100% - 32px);
    margin: 16px;
  }

  #tui-share-expiry-options {
    flex-direction: column;
    gap: 10px;
  }
}

/* Snippet modal styles */
#tui-snippet-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.7);
  z-index: 10010;
  display: flex;
  align-items: center;
  justify-content: center;
}

#tui-snippet-modal.hidden {
  display: none;
}

#tui-snippet-modal-content {
  background: #2d2d2d;
  border-radius: 12px;
  color: #e0e0e0;
  max-width: 450px;
  width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}

#tui-snippet-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #444;
  font-size: 16px;
  font-weight: bold;
}

#tui-snippet-modal-actions {
  display: flex;
  gap: 8px;
}

#tui-snippet-modal-actions button {
  background: none;
  border: none;
  color: #888;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
  border-radius: 4px;
}

#tui-snippet-modal-actions button:hover {
  color: #fff;
  background: #444;
}

#tui-snippet-add {
  color: #007acc !important;
  font-weight: bold;
}

#tui-snippet-add:hover {
  color: #fff !important;
}

#tui-snippet-modal-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

#tui-snippet-search {
  width: 100%;
  background: #1e1e1e;
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  padding: 10px;
  margin-bottom: 12px;
  box-sizing: border-box;
}

#tui-snippet-search:focus {
  outline: none;
  border-color: #007acc;
}

#tui-snippet-search::placeholder {
  color: #888;
}

#tui-snippet-add-form {
  background: #1e1e1e;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

#tui-snippet-add-form.hidden {
  display: none;
}

#tui-snippet-add-name {
  width: 100%;
  background: #2d2d2d;
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  padding: 10px;
  margin-bottom: 8px;
  box-sizing: border-box;
}

#tui-snippet-add-name:focus {
  outline: none;
  border-color: #007acc;
}

#tui-snippet-add-command {
  width: 100%;
  background: #2d2d2d;
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  font-family: monospace;
  font-size: 14px;
  padding: 10px;
  margin-bottom: 8px;
  box-sizing: border-box;
  resize: vertical;
  min-height: 60px;
}

#tui-snippet-add-command:focus {
  outline: none;
  border-color: #007acc;
}

#tui-snippet-add-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

#tui-snippet-add-buttons button {
  background: #3a3a3a;
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  padding: 8px 16px;
}

#tui-snippet-add-buttons button:hover {
  background: #4a4a4a;
}

#tui-snippet-add-save {
  background: #007acc !important;
  border-color: #005a9e !important;
}

#tui-snippet-add-save:hover {
  background: #005a9e !important;
}

#tui-snippet-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

#tui-snippet-empty {
  text-align: center;
  color: #888;
  padding: 24px;
  font-size: 14px;
  line-height: 1.6;
}

#tui-snippet-empty.hidden {
  display: none;
}

.tui-snippet-item {
  background: #1e1e1e;
  border-radius: 8px;
  padding: 12px;
}

.tui-snippet-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.tui-snippet-item-name {
  font-weight: bold;
  font-size: 14px;
  color: #fff;
}

.tui-snippet-item-actions {
  display: flex;
  gap: 4px;
}

.tui-snippet-item-actions button {
  background: #3a3a3a;
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  padding: 6px 10px;
  min-width: 36px;
  min-height: 36px;
}

.tui-snippet-item-actions button:hover {
  background: #4a4a4a;
}

.tui-snippet-item-run {
  background: #28a745 !important;
  border-color: #1e7e34 !important;
}

.tui-snippet-item-run:hover {
  background: #1e7e34 !important;
}

.tui-snippet-item-delete {
  color: #888 !important;
}

.tui-snippet-item-delete:hover {
  color: #dc3545 !important;
  background: #3a3a3a !important;
}

.tui-snippet-item-edit {
  color: #888 !important;
}

.tui-snippet-item-edit:hover {
  color: #007acc !important;
  background: #3a3a3a !important;
}

.tui-snippet-item-command {
  font-family: monospace;
  font-size: 12px;
  color: #aaa;
  background: #252525;
  padding: 8px;
  border-radius: 4px;
  word-break: break-all;
  white-space: pre-wrap;
}

.tui-snippet-item-edit-form {
  margin-top: 8px;
}

.tui-snippet-item-edit-form input,
.tui-snippet-item-edit-form textarea {
  width: 100%;
  background: #2d2d2d;
  border: 1px solid #555;
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  padding: 8px;
  margin-bottom: 6px;
  box-sizing: border-box;
}

.tui-snippet-item-edit-form textarea {
  font-family: monospace;
  resize: vertical;
  min-height: 50px;
}

.tui-snippet-item-edit-form input:focus,
.tui-snippet-item-edit-form textarea:focus {
  outline: none;
  border-color: #007acc;
}

.tui-snippet-item-edit-buttons {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.tui-snippet-item-edit-buttons button {
  background: #3a3a3a;
  border: 1px solid #555;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  padding: 6px 12px;
}

.tui-snippet-item-edit-buttons button:hover {
  background: #4a4a4a;
}

.tui-snippet-item-edit-save {
  background: #007acc !important;
  border-color: #005a9e !important;
}

.tui-snippet-item-edit-save:hover {
  background: #005a9e !important;
}

.tui-snippet-item.editing .tui-snippet-item-command {
  display: none;
}

.tui-snippet-item:not(.editing) .tui-snippet-item-edit-form {
  display: none;
}

/* Mobile adjustments for snippet modal */
@media (max-width: 768px) {
  #tui-snippet-modal-content {
    max-width: none;
    width: calc(100% - 32px);
    margin: 16px;
    max-height: 70vh;
  }

  .tui-snippet-item-actions button {
    min-width: 44px;
    min-height: 44px;
  }
}

/* Clipboard history popup */
#tui-clipboard-history {
  position: fixed;
  background: #2d2d2d;
  border: 1px solid #555;
  border-radius: 8px;
  max-width: 300px;
  max-height: 250px;
  overflow-y: auto;
  z-index: 10020;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

#tui-clipboard-history.hidden {
  display: none;
}

#tui-clipboard-history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #444;
  font-size: 13px;
  font-weight: bold;
  color: #fff;
}

#tui-clipboard-history-close {
  background: none;
  border: none;
  color: #888;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
}

#tui-clipboard-history-close:hover {
  color: #fff;
}

#tui-clipboard-history-list {
  padding: 6px;
}

.tui-clipboard-history-item {
  background: #1e1e1e;
  border-radius: 4px;
  padding: 8px 10px;
  margin-bottom: 4px;
  cursor: pointer;
  font-family: monospace;
  font-size: 12px;
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tui-clipboard-history-item:last-child {
  margin-bottom: 0;
}

.tui-clipboard-history-item:hover {
  background: #333;
  color: #fff;
}

#tui-clipboard-history-empty {
  padding: 16px;
  text-align: center;
  color: #888;
  font-size: 13px;
}

/* Mobile adjustments for clipboard history */
@media (max-width: 768px) {
  #tui-clipboard-history {
    max-width: calc(100vw - 32px);
    left: 16px !important;
    right: 16px !important;
  }
}

/* ============================================
   File Transfer Modal
   ============================================ */

#tui-file-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}

#tui-file-modal.hidden {
  display: none;
}

#tui-file-modal-content {
  background: #252526;
  border-radius: 8px;
  color: #e0e0e0;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

#tui-file-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #3a3a3a;
}

#tui-file-modal-header span {
  font-size: 16px;
  font-weight: bold;
  color: #fff;
}

#tui-file-modal-actions {
  display: flex;
  gap: 8px;
}

#tui-file-modal-actions button {
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 18px;
  padding: 4px 8px;
  min-width: 32px;
  min-height: 32px;
}

#tui-file-modal-actions button:hover {
  color: #fff;
}

#tui-file-modal-body {
  flex: 1;
  overflow: auto;
  padding: 8px;
}

#tui-file-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 8px 12px;
  background: #1e1e1e;
  border-radius: 4px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #888;
}

.bunterm-breadcrumb-item {
  cursor: pointer;
  color: #007acc;
}

.bunterm-breadcrumb-item:hover {
  text-decoration: underline;
}

.bunterm-breadcrumb-separator {
  color: #555;
}

#tui-file-list {
  max-height: 50vh;
  overflow-y: auto;
}

.tui-file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}

.tui-file-item:hover {
  background: #3a3a3a;
}

.tui-file-item.directory {
  font-weight: 500;
}

.tui-file-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.tui-file-name {
  flex: 1;
  color: #e0e0e0;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tui-file-size {
  color: #888;
  font-size: 12px;
  flex-shrink: 0;
}

.tui-file-spa-btn {
  background: #3a5a8a;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
  margin-left: auto;
  flex-shrink: 0;
  transition: background 0.15s;
}

.tui-file-spa-btn:hover {
  background: #4a6a9a;
}

.tui-file-loading,
.tui-file-error,
.tui-file-empty {
  padding: 24px;
  text-align: center;
  color: #888;
  font-size: 14px;
}

.tui-file-error {
  color: #f44336;
}

/* Recent files section */
.tui-recent-files {
  border-bottom: 1px solid #3a3a3a;
  padding: 8px;
  margin-bottom: 4px;
}

.tui-recent-header {
  font-size: 12px;
  color: #888;
  margin-bottom: 6px;
  padding: 0 4px;
}

.tui-recent-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
}

.tui-recent-item:hover {
  background: #3a3a3a;
}

.tui-recent-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.tui-recent-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.tui-recent-name {
  font-size: 13px;
  color: #e0e0e0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tui-recent-time {
  font-size: 11px;
  color: #666;
  flex-shrink: 0;
  margin-left: 8px;
}

/* Mobile adjustments for file modal */
@media (max-width: 768px) {
  #tui-file-modal-content {
    width: 95%;
    max-height: 85vh;
  }

  .tui-file-item {
    padding: 12px;
    min-height: 44px;
  }

  #tui-file-breadcrumb {
    font-size: 14px;
  }
}

/* ============================================
   Image Preview Modal (Smart Paste)
   ============================================ */

#tui-image-preview-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  z-index: 10020;
  display: flex;
  align-items: center;
  justify-content: center;
}

#tui-image-preview-modal.hidden {
  display: none;
}

#tui-image-preview-content {
  background: #2d2d2d;
  border-radius: 12px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

#tui-image-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #444;
  font-size: 16px;
  font-weight: bold;
  color: #fff;
}

#tui-image-preview-close {
  background: none;
  border: none;
  color: #888;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
}

#tui-image-preview-close:hover {
  color: #fff;
}

#tui-image-preview-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  overflow: auto;
}

#tui-image-preview-img {
  max-width: 100%;
  max-height: 60vh;
  object-fit: contain;
  border-radius: 8px;
  background: #1e1e1e;
}

#tui-image-preview-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 16px;
}

#tui-image-preview-nav button {
  background: #3a3a3a;
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 16px;
  padding: 8px 16px;
  min-width: 44px;
  min-height: 44px;
}

#tui-image-preview-nav button:hover {
  background: #4a4a4a;
}

#tui-image-preview-counter {
  color: #aaa;
  font-size: 14px;
  min-width: 50px;
  text-align: center;
}

#tui-image-preview-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
}

.tui-preview-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #555;
  cursor: pointer;
  transition: background 0.2s;
}

.tui-preview-dot:hover {
  background: #777;
}

.tui-preview-dot.active {
  background: #007acc;
}

#tui-image-preview-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid #444;
}

#tui-image-preview-footer button {
  background: #3a3a3a;
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  padding: 10px 20px;
  transition: background 0.2s;
}

#tui-image-preview-footer button:hover {
  background: #4a4a4a;
}

#tui-image-preview-footer button:disabled {
  background: #555;
  cursor: not-allowed;
  opacity: 0.6;
}

#tui-image-preview-remove {
  margin-right: auto;
  color: #888 !important;
}

#tui-image-preview-remove:hover {
  color: #dc3545 !important;
}

#tui-image-preview-submit {
  background: #007acc !important;
  border-color: #005a9e !important;
  font-weight: bold;
}

#tui-image-preview-submit:hover:not(:disabled) {
  background: #005a9e !important;
}

/* Mobile adjustments for image preview */
@media (max-width: 768px) {
  #tui-image-preview-content {
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 32px);
    margin: 8px;
  }

  #tui-image-preview-img {
    max-height: 50vh;
  }

  #tui-image-preview-footer {
    flex-wrap: wrap;
  }

  #tui-image-preview-footer button {
    padding: 12px 16px;
    min-height: 44px;
  }
}

/* ============================================
   Drop Zone Overlay
   ============================================ */

#tui-drop-zone {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 122, 204, 0.3);
  z-index: 10002;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

#tui-drop-zone.hidden {
  display: none;
}

#tui-drop-zone-content {
  border: 3px dashed #007acc;
  border-radius: 16px;
  padding: 48px 64px;
  font-size: 24px;
  color: #fff;
  background: rgba(0, 0, 0, 0.6);
  text-align: center;
}

/* Mobile adjustments for drop zone */
@media (max-width: 768px) {
  #tui-drop-zone-content {
    padding: 32px 48px;
    font-size: 18px;
    margin: 16px;
  }
}

/* ============================================
   Preview Pane
   ============================================ */

#tui-preview-pane {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: var(--preview-width, 400px);
  background: #fff;
  border-left: 2px solid #007acc;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  box-shadow: -2px 0 10px rgba(0,0,0,0.3);
}

#tui-preview-pane.hidden {
  display: none;
}

#tui-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #1e1e1e;
  color: #fff;
  font-size: 14px;
  border-bottom: 1px solid #333;
}

#tui-preview-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

#tui-preview-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

#tui-preview-actions button {
  background: transparent;
  border: 1px solid #555;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
  min-width: 32px;
  min-height: 32px;
  transition: background 0.2s;
}

#tui-preview-actions button:hover {
  background: #333;
}

#tui-preview-close:hover {
  color: #f44336;
}

#tui-preview-iframe {
  flex: 1;
  border: none;
  background: #fff;
  width: 100%;
  min-height: 0;
}

#tui-preview-resizer {
  position: absolute;
  left: -3px;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  background: transparent;
  z-index: 10000;
}

#tui-preview-resizer:hover {
  background: rgba(0, 122, 204, 0.5);
}

/* Terminal width adjustment when preview is open */
body.preview-open {
  overflow-x: hidden;
}

body.preview-open #terminal {
  width: calc(100vw - var(--preview-width, 400px)) !important;
  max-width: calc(100vw - var(--preview-width, 400px)) !important;
}

body.preview-open .terminal,
body.preview-open .xterm {
  width: 100% !important;
  max-width: calc(100vw - var(--preview-width, 400px)) !important;
}

body.preview-open .xterm-viewport,
body.preview-open .xterm-screen {
  width: 100% !important;
  max-width: calc(100vw - var(--preview-width, 400px)) !important;
}

/* Preview button active state */
#tui-preview.active {
  background: #007acc !important;
  border-color: #005a9e !important;
}

/* Mobile adjustments for preview pane */
@media (max-width: 768px) {
  #tui-preview-pane {
    width: 100% !important;
    left: 0;
    border-left: none;
    border-top: 2px solid #007acc;
    height: 50vh;
    top: auto;
  }

  #tui-preview-resizer {
    display: none;
  }

  body.preview-open {
    margin-bottom: 50vh !important;
  }

  body.preview-open #terminal {
    width: 100vw !important;
    max-width: 100vw !important;
    height: 50vh !important;
  }

  body.preview-open .terminal,
  body.preview-open .xterm {
    width: 100% !important;
    max-width: 100vw !important;
    height: 50vh !important;
  }

  body.preview-open .xterm-viewport,
  body.preview-open .xterm-screen {
    width: 100% !important;
    max-width: 100vw !important;
  }
}

/* ============================================
   Session Switcher Modal
   ============================================ */

#tui-session-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 10010;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
}

#tui-session-modal.hidden {
  display: none;
}

#tui-session-modal-content {
  background: #2d2d2d;
  border-radius: 12px;
  color: #e0e0e0;
  max-width: 500px;
  width: 90%;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

#tui-session-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #444;
  font-size: 16px;
  font-weight: bold;
  color: #fff;
}

#tui-session-modal-actions {
  display: flex;
  gap: 8px;
}

#tui-session-modal-actions button {
  background: none;
  border: none;
  color: #888;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
  border-radius: 4px;
}

#tui-session-modal-actions button:hover {
  color: #fff;
  background: #444;
}

#tui-session-modal-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

#tui-session-search {
  width: 100%;
  background: #1e1e1e;
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  padding: 10px;
  margin-bottom: 12px;
  box-sizing: border-box;
}

#tui-session-search:focus {
  outline: none;
  border-color: #007acc;
}

#tui-session-search::placeholder {
  color: #888;
}

#tui-session-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tui-session-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #1e1e1e;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  border-left: 3px solid transparent;
}

.tui-session-item:hover {
  background: #333;
}

.tui-session-item.selected {
  background: #2a4a6a;
}

.tui-session-item.current {
  border-left-color: #007acc;
  background: #1a3050;
}

.tui-session-item.current:hover {
  background: #1e3860;
}

.tui-session-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.tui-session-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.tui-session-name {
  font-weight: bold;
  font-size: 14px;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tui-session-path {
  font-size: 12px;
  color: #888;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}

.tui-session-current-badge {
  font-size: 10px;
  color: #007acc;
  background: rgba(0, 122, 204, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

#tui-session-empty {
  text-align: center;
  color: #888;
  padding: 24px;
  font-size: 14px;
}

#tui-session-loading {
  text-align: center;
  color: #888;
  padding: 24px;
  font-size: 14px;
}

#tui-session-error {
  text-align: center;
  color: #f44336;
  padding: 24px;
  font-size: 14px;
}

/* Session sections (bunterm/tmux) */
.tui-session-section {
  margin-bottom: 12px;
}

.tui-session-section-header {
  font-size: 11px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 8px 4px 4px;
  border-bottom: 1px solid #333;
  margin-bottom: 8px;
}

.tui-tmux-section {
  margin-top: 16px;
  padding-top: 8px;
  border-top: 1px solid #333;
}

.tui-tmux-item {
  border-left: 3px solid #00d9ff;
}

.tui-tmux-item.attached {
  border-left-color: #4caf50;
}

.tui-session-attached-badge {
  font-size: 10px;
  color: #4caf50;
  background: rgba(76, 175, 80, 0.15);
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}

/* Mobile adjustments for session modal */
@media (max-width: 768px) {
  #tui-session-modal {
    padding-top: 5vh;
  }

  #tui-session-modal-content {
    max-width: none;
    width: calc(100% - 32px);
    margin: 16px;
    max-height: 80vh;
  }

  .tui-session-item {
    padding: 14px 12px;
    min-height: 44px;
  }
}

/* =============================================================================
   Toast Notifications
   ============================================================================= */

#tui-toast-container {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10100;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  max-width: 400px;
}

.tui-toast {
  background: #333;
  color: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  font-size: 13px;
  line-height: 1.4;
  opacity: 0;
  transform: translateX(100%);
  transition: opacity 0.3s ease, transform 0.3s ease;
  pointer-events: auto;
  word-break: break-word;
  max-width: 100%;
}

.tui-toast.show {
  opacity: 1;
  transform: translateX(0);
}

.tui-toast-error {
  background: #c62828;
  border-left: 4px solid #f44336;
}

.tui-toast-success {
  background: #2e7d32;
  border-left: 4px solid #4caf50;
}

.tui-toast-info {
  background: #1565c0;
  border-left: 4px solid #2196f3;
}

/* Mobile adjustments for toast */
@media (max-width: 768px) {
  #tui-toast-container {
    left: 16px;
    right: 16px;
    max-width: none;
  }

  .tui-toast {
    width: 100%;
  }
}

/* =============================================================================
   Block UI (Warp-style command blocks)
   ============================================================================= */

.block-overlay-container {
  pointer-events: none;
  overflow: hidden;
}

.block-item {
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.block-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: linear-gradient(180deg, rgba(30, 30, 30, 0.95) 0%, rgba(30, 30, 30, 0.8) 100%);
  border-radius: 6px 6px 0 0;
  border-left: 3px solid #555;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 12px;
  pointer-events: auto;
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  margin-top: 2px;
}

.block-item.block-running .block-header {
  border-left-color: #f0ad4e;
  background: linear-gradient(180deg, rgba(45, 40, 30, 0.95) 0%, rgba(45, 40, 30, 0.8) 100%);
}

.block-item.block-success .block-header {
  border-left-color: #28a745;
  background: linear-gradient(180deg, rgba(30, 40, 35, 0.95) 0%, rgba(30, 40, 35, 0.8) 100%);
}

.block-item.block-error .block-header {
  border-left-color: #dc3545;
  background: linear-gradient(180deg, rgba(45, 30, 30, 0.95) 0%, rgba(45, 30, 30, 0.8) 100%);
}

.block-status {
  font-size: 14px;
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}

.block-status-running {
  color: #f0ad4e;
  animation: block-pulse 1.5s ease-in-out infinite;
}

.block-status-success {
  color: #28a745;
}

.block-status-error {
  color: #dc3545;
}

@keyframes block-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.block-command {
  color: #fff;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.block-cwd {
  color: #888;
  font-size: 10px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.block-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}

.block-header:hover .block-actions {
  opacity: 1;
}

.block-action-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #ccc;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
  min-width: 24px;
  min-height: 20px;
  transition: all 0.15s ease;
}

.block-action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.4);
}

.block-action-copy-cmd:hover {
  background: rgba(0, 122, 204, 0.3);
  border-color: rgba(0, 122, 204, 0.5);
}

.block-action-copy-out:hover {
  background: rgba(40, 167, 69, 0.3);
  border-color: rgba(40, 167, 69, 0.5);
}

.block-action-filter:hover {
  background: rgba(240, 173, 78, 0.3);
  border-color: rgba(240, 173, 78, 0.5);
}

.block-action-ai:hover {
  background: rgba(156, 39, 176, 0.3);
  border-color: rgba(156, 39, 176, 0.5);
}

.block-action-rerun:hover {
  background: rgba(76, 175, 80, 0.3);
  border-color: rgba(76, 175, 80, 0.5);
}

.block-action-bookmark:hover {
  background: rgba(255, 193, 7, 0.3);
  border-color: rgba(255, 193, 7, 0.5);
}

.block-action-bookmark.active {
  background: rgba(255, 193, 7, 0.4);
  border-color: rgba(255, 193, 7, 0.6);
  color: #ffc107;
}

/* Bookmarked block state */
.block-item.bookmarked .block-header {
  border-left-color: #ffc107 !important;
}

.block-header.bookmarked::before {
  content: '\u2605';
  position: absolute;
  right: -8px;
  top: -8px;
  font-size: 14px;
  color: #ffc107;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

/* Block context info */
.block-context {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  flex-shrink: 0;
}

.block-exit-code {
  background: rgba(220, 53, 69, 0.3);
  border: 1px solid rgba(220, 53, 69, 0.5);
  color: #ff6b6b;
  font-size: 10px;
  font-weight: bold;
  padding: 1px 6px;
  border-radius: 4px;
}

.block-duration {
  color: #888;
  font-size: 10px;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
}

.block-timestamp {
  color: #666;
  font-size: 10px;
}

/* Block toggle button */
#block-ui-toggle {
  position: fixed;
  top: 8px;
  right: 8px;
  background: #3a3a3a;
  border: 1px solid #555;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  padding: 6px 10px;
  z-index: 9001;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

#block-ui-toggle:hover {
  background: #4a4a4a;
}

#block-ui-toggle.active {
  background: #007acc;
  border-color: #005a9e;
}

/* Block selection state */
.block-item.selected .block-header {
  background: linear-gradient(180deg, rgba(0, 100, 180, 0.95) 0%, rgba(0, 80, 150, 0.85) 100%);
  border-left-color: #007acc;
  box-shadow: 0 2px 12px rgba(0, 122, 204, 0.4);
}

.block-item.selected.block-running .block-header {
  background: linear-gradient(180deg, rgba(30, 90, 140, 0.95) 0%, rgba(20, 70, 120, 0.85) 100%);
}

.block-item.selected.block-success .block-header {
  background: linear-gradient(180deg, rgba(0, 100, 180, 0.95) 0%, rgba(0, 80, 150, 0.85) 100%);
}

.block-item.selected.block-error .block-header {
  background: linear-gradient(180deg, rgba(80, 50, 100, 0.95) 0%, rgba(60, 40, 80, 0.85) 100%);
}

/* Block context menu */
.block-context-menu {
  position: fixed;
  background: #2d2d2d;
  border: 1px solid #555;
  border-radius: 8px;
  padding: 4px;
  z-index: 10100;
  min-width: 160px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.block-context-menu.hidden {
  display: none;
}

.block-context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  transition: background 0.15s ease;
}

.block-context-menu-item:hover {
  background: #3a3a3a;
  color: #fff;
}

.block-context-menu-item .menu-icon {
  width: 18px;
  text-align: center;
  font-size: 14px;
  color: #aaa;
}

.block-context-menu-item:hover .menu-icon {
  color: #fff;
}

/* Block filter toolbar */
.block-filter-toolbar {
  position: fixed;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  background: rgba(30, 30, 30, 0.95);
  padding: 4px;
  border-radius: 8px;
  border: 1px solid #555;
  z-index: 9002;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.block-filter-toolbar.hidden {
  display: none;
}

.block-filter-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #aaa;
  cursor: pointer;
  font-size: 12px;
  padding: 6px 10px;
  transition: all 0.15s ease;
}

.block-filter-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.block-filter-btn.active {
  background: #007acc;
  border-color: #005a9e;
  color: #fff;
}

.block-filter-btn .filter-icon {
  font-size: 11px;
}

.block-filter-btn .filter-label {
  font-weight: 500;
}

.block-filter-btn .filter-count {
  background: rgba(255, 255, 255, 0.15);
  padding: 1px 5px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: bold;
  min-width: 14px;
  text-align: center;
}

.block-filter-btn .filter-count.hidden {
  display: none;
}

.block-filter-btn.active .filter-count {
  background: rgba(255, 255, 255, 0.25);
}

/* Filter status colors */
.block-filter-success.active {
  background: #28a745;
  border-color: #1e7e34;
}

.block-filter-error.active {
  background: #dc3545;
  border-color: #c82333;
}

.block-filter-running.active {
  background: #f0ad4e;
  border-color: #eea236;
  color: #000;
}

/* Filtered out blocks */
.block-item.filtered-out {
  display: none !important;
}

/* Block search toolbar */
.block-search-toolbar {
  position: fixed;
  top: 50px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(30, 30, 30, 0.98);
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #555;
  z-index: 9003;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  min-width: 300px;
}

.block-search-toolbar.hidden {
  display: none !important;
}

.block-search-input {
  flex: 1;
  background: #1e1e1e;
  border: 1px solid #555;
  border-radius: 4px;
  color: #fff;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  padding: 6px 10px;
  outline: none;
  min-width: 150px;
}

.block-search-input:focus {
  border-color: #007acc;
  box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
}

.block-search-input::placeholder {
  color: #666;
}

.block-search-results {
  color: #888;
  font-size: 12px;
  min-width: 60px;
  text-align: center;
  white-space: nowrap;
}

.block-search-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #aaa;
  cursor: pointer;
  font-size: 10px;
  padding: 4px 8px;
  min-width: 24px;
  min-height: 24px;
  transition: all 0.15s ease;
}

.block-search-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.4);
}

.block-search-options {
  display: flex;
  gap: 8px;
  margin-left: 4px;
  padding-left: 8px;
  border-left: 1px solid #444;
}

.block-search-option {
  display: flex;
  align-items: center;
  gap: 3px;
  color: #888;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  transition: all 0.15s ease;
}

.block-search-option:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.block-search-option input[type="checkbox"] {
  width: 12px;
  height: 12px;
  accent-color: #007acc;
  cursor: pointer;
}

.block-search-close {
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 6px;
  margin-left: 4px;
  transition: color 0.15s ease;
}

.block-search-close:hover {
  color: #ff6b6b;
}

/* Search highlight on blocks */
.block-item.search-highlight .block-header {
  outline: 2px solid #ffa500;
  outline-offset: -2px;
  background: linear-gradient(180deg, rgba(100, 70, 20, 0.95) 0%, rgba(80, 50, 10, 0.85) 100%) !important;
  animation: search-pulse 1s ease-in-out infinite;
}

@keyframes search-pulse {
  0%, 100% {
    box-shadow: 0 2px 8px rgba(255, 165, 0, 0.3);
  }
  50% {
    box-shadow: 0 2px 20px rgba(255, 165, 0, 0.6);
  }
}

/* Block sidebar */
.block-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 280px;
  background: rgba(30, 30, 30, 0.98);
  border-right: 1px solid #555;
  z-index: 9005;
  display: flex;
  flex-direction: column;
  box-shadow: 2px 0 20px rgba(0, 0, 0, 0.5);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.block-sidebar.hidden {
  display: none;
}

.block-sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #444;
  font-size: 14px;
  font-weight: bold;
  color: #fff;
}

.block-sidebar-close {
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 16px;
  padding: 4px 8px;
  border-radius: 4px;
}

.block-sidebar-close:hover {
  color: #fff;
  background: #444;
}

.block-sidebar-filters {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid #333;
}

.block-sidebar-filter-btn {
  flex: 1;
  background: transparent;
  border: 1px solid #444;
  border-radius: 4px;
  color: #888;
  cursor: pointer;
  font-size: 12px;
  padding: 6px 8px;
  transition: all 0.15s ease;
}

.block-sidebar-filter-btn:hover {
  background: #3a3a3a;
  color: #fff;
}

.block-sidebar-filter-btn.active {
  background: #007acc;
  border-color: #005a9e;
  color: #fff;
}

.block-sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.block-sidebar-empty {
  text-align: center;
  color: #666;
  padding: 24px;
  font-size: 13px;
}

.block-sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin-bottom: 4px;
  background: #252525;
  border-radius: 6px;
  border-left: 3px solid #555;
  cursor: pointer;
  transition: all 0.15s ease;
}

.block-sidebar-item:hover {
  background: #333;
}

.block-sidebar-item.block-sidebar-success {
  border-left-color: #28a745;
}

.block-sidebar-item.block-sidebar-error {
  border-left-color: #dc3545;
}

.block-sidebar-item.block-sidebar-running {
  border-left-color: #f0ad4e;
}

.block-sidebar-item.bookmarked {
  background: #2a2520;
}

.block-sidebar-status {
  font-size: 12px;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}

.block-sidebar-success .block-sidebar-status {
  color: #28a745;
}

.block-sidebar-error .block-sidebar-status {
  color: #dc3545;
}

.block-sidebar-running .block-sidebar-status {
  color: #f0ad4e;
}

.block-sidebar-command {
  flex: 1;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 11px;
  color: #ccc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.block-sidebar-duration {
  font-size: 10px;
  color: #666;
  flex-shrink: 0;
}

.block-sidebar-bookmark {
  font-size: 12px;
  color: #ffc107;
  flex-shrink: 0;
}

/* Focused block state (keyboard navigation) */
.block-item.focused .block-header {
  outline: 2px solid #007acc;
  outline-offset: -2px;
  background: linear-gradient(180deg, rgba(0, 60, 120, 0.95) 0%, rgba(0, 40, 80, 0.85) 100%) !important;
  border-left-color: #007acc !important;
}

.block-header.focused {
  animation: focus-pulse 1.5s ease-in-out infinite;
}

@keyframes focus-pulse {
  0%, 100% {
    box-shadow: 0 2px 8px rgba(0, 122, 204, 0.3);
  }
  50% {
    box-shadow: 0 2px 16px rgba(0, 122, 204, 0.6);
  }
}

/* Mobile adjustments for block UI */
@media (max-width: 768px) {
  .block-header {
    padding: 6px 8px;
    font-size: 11px;
  }

  .block-command {
    font-size: 11px;
  }

  .block-cwd {
    display: none;
  }

  .block-actions {
    opacity: 1;
  }

  .block-action-btn {
    min-width: 32px;
    min-height: 28px;
    font-size: 14px;
  }

  #block-ui-toggle {
    top: auto;
    bottom: 160px;
    right: 8px;
    padding: 8px 12px;
    font-size: 14px;
  }

  body:has(#tui.hidden) #block-ui-toggle {
    bottom: 80px;
  }

  /* Filter toolbar mobile adjustments */
  .block-filter-toolbar {
    top: auto;
    bottom: 70px;
    left: 8px;
    right: 8px;
    transform: none;
    justify-content: center;
  }

  .block-filter-btn {
    padding: 8px 12px;
    font-size: 13px;
  }

  .block-filter-btn .filter-label {
    display: none;
  }

  .block-filter-btn .filter-icon {
    font-size: 14px;
  }

  body:has(#tui.hidden) .block-filter-toolbar {
    bottom: 16px;
  }
}

/* =============================================================================
   Quote Modal
   ============================================================================= */

#tui-quote-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 10vh;
}

#tui-quote-modal.hidden {
  display: none;
}

#tui-quote-modal-content {
  background: #252525;
  border-radius: 12px;
  color: #e0e0e0;
  width: 90%;
  max-width: 600px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

#tui-quote-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #333;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}

#tui-quote-modal-close {
  background: transparent;
  border: none;
  color: #888;
  font-size: 24px;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
}

#tui-quote-modal-close:hover {
  color: #fff;
}

#tui-quote-tabs {
  display: flex;
  padding: 0 12px;
  border-bottom: 1px solid #333;
  overflow-x: auto;
}

.tui-quote-tab {
  padding: 12px 16px;
  font-size: 13px;
  color: #888;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s;
}

.tui-quote-tab:hover {
  color: #ccc;
}

.tui-quote-tab.active {
  color: #3a86ff;
  border-bottom-color: #3a86ff;
}

#tui-quote-controls {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid #333;
}

#tui-quote-controls button {
  padding: 4px 10px;
  font-size: 12px;
  color: #aaa;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

#tui-quote-controls button:hover {
  background: rgba(255, 255, 255, 0.1);
}

#tui-quote-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.tui-quote-session-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(0, 122, 204, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 8px;
}

.tui-quote-session-label {
  color: #888;
  font-size: 12px;
}

.tui-quote-session-select {
  flex: 1;
  background: #2d2d2d;
  border: 1px solid #444;
  border-radius: 4px;
  color: #d4d4d4;
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
}

.tui-quote-session-select:focus {
  outline: none;
  border-color: #007acc;
}

.tui-quote-item {
  display: flex;
  align-items: flex-start;
  padding: 10px 16px;
  cursor: pointer;
  transition: background-color 0.1s;
}

.tui-quote-item:hover {
  background: rgba(255, 255, 255, 0.03);
}

.tui-quote-item input[type="checkbox"] {
  margin-right: 12px;
  margin-top: 3px;
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #3a86ff;
}

.tui-quote-item-content {
  flex: 1;
  min-width: 0;
}

.tui-quote-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.tui-quote-item-title {
  flex: 1;
  font-size: 13px;
  color: #ddd;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tui-quote-item-time {
  font-size: 11px;
  color: #666;
  flex-shrink: 0;
}

.tui-quote-item-summary {
  font-size: 12px;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tui-quote-item-meta {
  font-size: 11px;
  color: #666;
  margin-top: 2px;
}

.tui-quote-empty {
  padding: 40px 20px;
  text-align: center;
  color: #666;
}

.tui-quote-full-diff {
  background: rgba(58, 134, 255, 0.1);
  border-bottom: 1px solid #333;
}

.tui-quote-status-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.1);
  color: #aaa;
}

.tui-quote-diff-stats {
  display: flex;
  gap: 6px;
  font-size: 11px;
  flex-shrink: 0;
}

.tui-quote-additions {
  color: #4caf50;
}

.tui-quote-deletions {
  color: #f44336;
}

#tui-quote-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid #333;
}

#tui-quote-selection-info {
  font-size: 12px;
  color: #888;
}

#tui-quote-copy {
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: #3a86ff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

#tui-quote-copy:hover:not(:disabled) {
  background: #2a76ef;
}

#tui-quote-copy:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Mobile adjustments for quote modal */
@media (max-width: 768px) {
  #tui-quote-modal {
    padding-top: 5vh;
  }

  #tui-quote-modal-content {
    max-width: none;
    width: calc(100% - 32px);
    margin: 16px;
    max-height: 80vh;
  }

  .tui-quote-tab {
    padding: 12px 10px;
    font-size: 12px;
  }

  .tui-quote-item {
    padding: 12px 12px;
  }
}

/* =============================================================================
   Path Link Popup
   ============================================================================= */

.path-link-popup {
  position: fixed;
  z-index: 10100;
  background: #2d2d2d;
  border: 1px solid #555;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  min-width: 200px;
  max-width: 400px;
  font-size: 13px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.path-link-popup.hidden {
  display: none;
}

.popup-header {
  padding: 8px 12px;
  border-bottom: 1px solid #444;
  display: flex;
  align-items: center;
  gap: 8px;
}

.popup-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.popup-path {
  color: #4fc3f7;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  word-break: break-all;
  overflow-wrap: break-word;
  line-height: 1.4;
}

.popup-actions {
  display: flex;
  flex-direction: column;
}

.popup-actions button {
  padding: 8px 12px;
  background: transparent;
  border: none;
  color: #e0e0e0;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  transition: background 0.15s ease;
}

.popup-actions button:hover {
  background: #3a3a3a;
}

.popup-actions button:first-child {
  border-radius: 0;
}

.popup-actions button:last-child {
  border-radius: 0 0 5px 5px;
}

/* xterm link layer custom styles */
.xterm .xterm-screen a {
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
}

.xterm .xterm-screen a:hover {
  text-decoration-style: solid;
}

/* Mobile adjustments for path link popup */
@media (max-width: 768px) {
  .path-link-popup {
    min-width: 180px;
    max-width: calc(100vw - 32px);
  }

  .popup-actions button {
    padding: 12px;
    min-height: 44px;
  }
}

/* =============================================================================
   File Operations Sidebar
   ============================================================================= */

#tui-file-ops-pane {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: var(--file-ops-width, 300px);
  background: #1e1e1e;
  border-left: 2px solid #007acc;
  z-index: 9998;
  display: flex;
  flex-direction: column;
  box-shadow: -2px 0 10px rgba(0,0,0,0.3);
}

#tui-file-ops-pane.hidden {
  display: none !important;
}

#tui-file-ops-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #252526;
  border-bottom: 1px solid #333;
  font-size: 14px;
  font-weight: bold;
  color: #fff;
  flex-shrink: 0;
}

#tui-file-ops-actions {
  display: flex;
  gap: 8px;
}

#tui-file-ops-actions button {
  background: none;
  border: none;
  color: #888;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.15s, color 0.15s;
}

#tui-file-ops-actions button:hover {
  color: #fff;
  background: #3a3a3a;
}

#tui-file-ops-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

#tui-file-ops-resizer {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: ew-resize;
  background: transparent;
  transition: background 0.15s;
}

#tui-file-ops-resizer:hover {
  background: #007acc;
}

/* File operation item */
.file-ops-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid #2a2a2a;
  cursor: pointer;
  transition: background 0.15s;
}

.file-ops-item:hover {
  background: #2a2d2e;
}

.file-ops-item:last-child {
  border-bottom: none;
}

.file-ops-icon {
  font-size: 16px;
  flex-shrink: 0;
  width: 24px;
  text-align: center;
}

.file-ops-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-ops-filename {
  font-size: 13px;
  font-weight: 500;
  color: #e0e0e0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-ops-path {
  font-size: 11px;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-ops-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #4caf50;
}

.file-ops-status.pending {
  background: #ffc107;
  animation: pulse-pending 1s ease-in-out infinite;
}

.file-ops-status.error {
  background: #f44336;
}

@keyframes pulse-pending {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* Tool-specific icon colors */
.file-ops-item[data-tool="Read"] .file-ops-icon { color: #2196f3; }
.file-ops-item[data-tool="Edit"] .file-ops-icon { color: #ff9800; }
.file-ops-item[data-tool="Write"] .file-ops-icon { color: #4caf50; }
.file-ops-item[data-tool="Grep"] .file-ops-icon { color: #9c27b0; }
.file-ops-item[data-tool="Glob"] .file-ops-icon { color: #9c27b0; }
.file-ops-item[data-tool="NotebookEdit"] .file-ops-icon { color: #ff5722; }

/* Adjust terminal width when sidebar is open */
body.file-ops-open #terminal,
body.file-ops-open .terminal,
body.file-ops-open .terminal-pane {
  width: calc(100% - var(--file-ops-width, 300px)) !important;
}

/* When both preview pane and file-ops sidebar are open */
body.preview-open.file-ops-open #tui-preview-pane {
  right: var(--file-ops-width, 300px);
}

body.preview-open.file-ops-open #terminal {
  width: calc(100vw - var(--preview-width, 400px) - var(--file-ops-width, 300px)) !important;
  max-width: calc(100vw - var(--preview-width, 400px) - var(--file-ops-width, 300px)) !important;
}

body.preview-open.file-ops-open .terminal,
body.preview-open.file-ops-open .xterm {
  max-width: calc(100vw - var(--preview-width, 400px) - var(--file-ops-width, 300px)) !important;
}

/* Hide sidebar on mobile */
@media (max-width: 768px) {
  #tui-file-ops-pane {
    display: none !important;
  }

  body.file-ops-open #terminal,
  body.file-ops-open .terminal,
  body.file-ops-open .terminal-pane {
    width: 100% !important;
  }

  /* Reset preview pane position on mobile */
  body.preview-open.file-ops-open #tui-preview-pane {
    right: 0;
  }
}

/* ============================================
   Mobile Selection Handles
   ============================================ */

#tui-selection-handles {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 1001;
}

#tui-selection-handles.hidden {
  display: none;
}

.selection-handle {
  position: absolute;
  width: 24px;
  height: 24px;
  background: #1976d2;
  border: 2px solid #fff;
  border-radius: 50%;
  touch-action: none;
  pointer-events: auto;
  cursor: grab;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  transform: translate(-50%, 0);
}

.selection-handle::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  background: #fff;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.selection-handle:active {
  cursor: grabbing;
  background: #1565c0;
  transform: translate(-50%, 0) scale(1.1);
}

#tui-handle-start::before {
  content: '';
  position: absolute;
  top: -20px;
  left: 50%;
  width: 2px;
  height: 20px;
  background: #1976d2;
  transform: translateX(-50%);
}

#tui-handle-end::before {
  content: '';
  position: absolute;
  top: -20px;
  left: 50%;
  width: 2px;
  height: 20px;
  background: #1976d2;
  transform: translateX(-50%);
}

/* Selection Copy Button */
#tui-selection-copy-btn {
  position: fixed;
  background: #1976d2;
  border: none;
  border-radius: 20px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: bold;
  padding: 8px 20px;
  z-index: 1002;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  transform: translateX(-50%);
  touch-action: manipulation;
  transition: background 0.15s, transform 0.15s;
}

#tui-selection-copy-btn.hidden {
  display: none;
}

#tui-selection-copy-btn:hover,
#tui-selection-copy-btn:active {
  background: #1565c0;
  transform: translateX(-50%) scale(1.05);
}

/* Mobile adjustments for selection handles */
@media (max-width: 768px) {
  .selection-handle {
    width: 28px;
    height: 28px;
  }

  .selection-handle::after {
    width: 10px;
    height: 10px;
  }

  #tui-selection-copy-btn {
    font-size: 15px;
    padding: 10px 24px;
  }
}

/* =============================================================================
   Repomix Tab Styles
   ============================================================================= */

.tui-repomix-input-group {
  padding: 16px;
  border-bottom: 1px solid #333;
}

.tui-repomix-label {
  display: block;
  font-size: 13px;
  color: #aaa;
  margin-bottom: 8px;
}

.tui-repomix-input-row {
  display: flex;
  gap: 8px;
}

.tui-repomix-input {
  flex: 1;
  padding: 10px 12px;
  font-size: 13px;
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
}

.tui-repomix-input:focus {
  outline: none;
  border-color: #1976d2;
}

.tui-repomix-run {
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 500;
  background: #1976d2;
  border: none;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  transition: background 0.2s;
}

.tui-repomix-run:hover {
  background: #1565c0;
}

.tui-repomix-loading {
  padding: 40px 20px;
  text-align: center;
  color: #888;
  font-size: 14px;
}

.tui-repomix-error {
  padding: 16px;
  margin: 16px;
  background: rgba(244, 67, 54, 0.1);
  border-left: 3px solid #f44336;
  border-radius: 4px;
  color: #f44336;
  font-size: 13px;
}

.tui-repomix-result {
  padding: 16px;
}

.tui-repomix-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #888;
}

.tui-repomix-preview {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 12px;
  font-size: 11px;
  line-height: 1.4;
  color: #aaa;
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin-bottom: 12px;
}

.tui-repomix-copy {
  width: 100%;
  padding: 12px;
  font-size: 14px;
  font-weight: 500;
  background: #4caf50;
  border: none;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  transition: background 0.2s;
}

.tui-repomix-copy:hover {
  background: #43a047;
}
`;
