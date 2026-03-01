/**
 * Terminal Toolbar CSS Styles
 */

export const terminalUiStyles = `
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

#tui-toggle {
  position: fixed;
  bottom: 16px;
  right: 16px;
  background: #007acc;
  border: 2px solid #005a9e;
  border-radius: 28px;
  color: #fff;
  cursor: pointer;
  font-size: 20px;
  min-width: 56px;
  height: 56px;
  padding: 0 16px;
  z-index: 10001;
  touch-action: manipulation;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.3s ease;
}

#tui-toggle:hover, #tui-toggle:active {
  background: #005a9e;
  transform: scale(1.05);
}

.tui-toggle-icon {
  font-size: 20px;
}

.tui-toggle-badge {
  font-size: 14px;
  font-weight: bold;
  display: none;
}

/* When toolbar is hidden, show badge and pulse animation */
#tui.hidden ~ #tui-toggle {
  bottom: 16px;
  animation: tui-pulse 2s ease-in-out infinite;
  background: linear-gradient(135deg, #007acc 0%, #28a745 100%);
  border-color: #1e7e34;
}

#tui.hidden ~ #tui-toggle .tui-toggle-badge {
  display: inline;
}

@keyframes tui-pulse {
  0%, 100% {
    box-shadow: 0 2px 8px rgba(0, 122, 204, 0.3);
  }
  50% {
    box-shadow: 0 2px 20px rgba(0, 122, 204, 0.6), 0 0 10px rgba(40, 167, 69, 0.4);
  }
}

/* When toolbar is visible, show only icon */
#tui:not(.hidden) ~ #tui-toggle {
  border-radius: 50%;
  padding: 0;
  min-width: 56px;
  width: 56px;
  animation: none;
  background: #007acc;
  border-color: #005a9e;
}

#tui:not(.hidden) ~ #tui-toggle .tui-toggle-badge {
  display: none;
}

/* Adjust layout when toolbar is visible */
body:has(#tui:not(.hidden)) {
  padding-bottom: 150px !important;
  box-sizing: border-box;
  height: 100vh;
  overflow: hidden;
}

body:has(#tui:not(.hidden)) .terminal {
  height: calc(100vh - 150px) !important;
}

body:has(#tui:not(.hidden)) .xterm {
  height: 100% !important;
}

body:has(#tui:not(.hidden)) .xterm-viewport,
body:has(#tui:not(.hidden)) .xterm-screen {
  height: 100% !important;
}

/* Adjust layout when minimized toolbar is visible */
body:has(#tui.minimized:not(.hidden)) {
  padding-bottom: 60px !important;
}

body:has(#tui.minimized:not(.hidden)) .terminal {
  height: calc(100vh - 60px) !important;
}

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

/* Mobile optimizations */
@media (max-width: 768px) {
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

  #tui-toggle {
    min-width: 64px;
    height: 64px;
    font-size: 24px;
  }

  .tui-toggle-icon {
    font-size: 24px;
  }

  .tui-toggle-badge {
    font-size: 16px;
  }

  #tui:not(.hidden) ~ #tui-toggle {
    min-width: 64px;
    width: 64px;
  }

  body:has(#tui:not(.hidden)) {
    padding-bottom: 120px !important;
  }

  body:has(#tui:not(.hidden)) .terminal {
    height: calc(100vh - 120px) !important;
  }

  body:has(#tui.minimized:not(.hidden)) {
    padding-bottom: 60px !important;
  }

  body:has(#tui.minimized:not(.hidden)) .terminal {
    height: calc(100vh - 60px) !important;
  }

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

.ttyd-breadcrumb-item {
  cursor: pointer;
  color: #007acc;
}

.ttyd-breadcrumb-item:hover {
  text-decoration: underline;
}

.ttyd-breadcrumb-separator {
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
`;
