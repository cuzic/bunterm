/**
 * AI Chat App Entry Point
 *
 * Mounts the React app to the DOM.
 */

import { createRoot } from 'react-dom/client';
import { App } from './App.js';

// Mount the app
function mount() {
  const container = document.getElementById('ai-chat-app');

  if (!container) {
    console.error('[AIChat] Container element not found');
    return;
  }

  const root = createRoot(container);
  root.render(<App />);

  console.log('[AIChat] App mounted');
}

// Auto-mount when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}

// Export for manual mounting
export { App, mount };
