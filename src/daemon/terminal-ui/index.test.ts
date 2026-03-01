import { describe, expect, test } from 'bun:test';
import {
  AUTO_RUN_KEY,
  CLIPBOARD_HISTORY_KEY,
  DEFAULT_TERMINAL_UI_CONFIG,
  ONBOARDING_SHOWN_KEY,
  SNIPPETS_KEY,
  STORAGE_KEY,
  injectTerminalUi,
  onboardingHtml,
  terminalUiHtml,
  terminalUiStyles
} from './index.js';

describe('toolbar/config', () => {
  test('DEFAULT_TERMINAL_UI_CONFIG has correct font_size_min', () => {
    expect(DEFAULT_TERMINAL_UI_CONFIG.font_size_min).toBe(10);
  });

  test('DEFAULT_TERMINAL_UI_CONFIG has correct font_size_max', () => {
    expect(DEFAULT_TERMINAL_UI_CONFIG.font_size_max).toBe(48);
  });

  test('DEFAULT_TERMINAL_UI_CONFIG has correct font_size_default_mobile', () => {
    expect(DEFAULT_TERMINAL_UI_CONFIG.font_size_default_mobile).toBe(32);
  });

  test('DEFAULT_TERMINAL_UI_CONFIG has correct font_size_default_pc', () => {
    expect(DEFAULT_TERMINAL_UI_CONFIG.font_size_default_pc).toBe(14);
  });

  test('DEFAULT_TERMINAL_UI_CONFIG has correct double_tap_delay', () => {
    expect(DEFAULT_TERMINAL_UI_CONFIG.double_tap_delay).toBe(300);
  });

  test('STORAGE_KEY is defined', () => {
    expect(STORAGE_KEY).toBe('tui-font-size');
  });

  test('ONBOARDING_SHOWN_KEY is defined', () => {
    expect(ONBOARDING_SHOWN_KEY).toBe('tui-onboarding-shown');
  });

  test('AUTO_RUN_KEY is defined', () => {
    expect(AUTO_RUN_KEY).toBe('tui-auto-run');
  });

  test('SNIPPETS_KEY is defined', () => {
    expect(SNIPPETS_KEY).toBe('ttyd-mux-snippets');
  });

  test('CLIPBOARD_HISTORY_KEY is defined', () => {
    expect(CLIPBOARD_HISTORY_KEY).toBe('ttyd-mux-clipboard-history');
  });
});

describe('toolbar/styles', () => {
  test('contains toolbar container styles', () => {
    expect(terminalUiStyles).toContain('#tui');
  });

  test('contains toolbar toggle button styles', () => {
    expect(terminalUiStyles).toContain('#tui-toggle');
  });

  test('contains button styles', () => {
    expect(terminalUiStyles).toContain('#tui-buttons button');
  });

  test('contains mobile media query', () => {
    expect(terminalUiStyles).toContain('@media (max-width: 768px)');
  });

  test('contains hidden class', () => {
    expect(terminalUiStyles).toContain('#tui.hidden');
  });

  test('contains minimized mode styles', () => {
    expect(terminalUiStyles).toContain('#tui.minimized');
    expect(terminalUiStyles).toContain('#tui.minimized #tui-buttons');
  });

  test('contains minimize button styles', () => {
    expect(terminalUiStyles).toContain('#tui-minimize');
  });

  test('contains onboarding tooltip styles', () => {
    expect(terminalUiStyles).toContain('#tui-onboarding');
    expect(terminalUiStyles).toContain('#tui-onboarding-close');
  });
});

describe('toolbar/template', () => {
  test('contains toolbar container element', () => {
    expect(terminalUiHtml).toContain('id="tui"');
  });

  test('contains toolbar toggle button', () => {
    expect(terminalUiHtml).toContain('id="tui-toggle"');
  });

  test('contains modifier buttons', () => {
    expect(terminalUiHtml).toContain('id="tui-ctrl"');
    expect(terminalUiHtml).toContain('id="tui-alt"');
    expect(terminalUiHtml).toContain('id="tui-shift"');
  });

  test('contains zoom buttons', () => {
    expect(terminalUiHtml).toContain('id="tui-zoomin"');
    expect(terminalUiHtml).toContain('id="tui-zoomout"');
  });

  test('contains copy buttons', () => {
    expect(terminalUiHtml).toContain('id="tui-copyall"');
  });

  test('contains input textarea', () => {
    expect(terminalUiHtml).toContain('id="tui-input"');
  });

  test('has hidden class by default', () => {
    expect(terminalUiHtml).toContain('class="hidden"');
  });

  test('contains minimize button', () => {
    expect(terminalUiHtml).toContain('id="tui-minimize"');
  });
});

describe('toolbar/onboarding', () => {
  test('contains onboarding container', () => {
    expect(onboardingHtml).toContain('id="tui-onboarding"');
  });

  test('contains close button', () => {
    expect(onboardingHtml).toContain('id="tui-onboarding-close"');
  });

  test('contains tips content', () => {
    expect(onboardingHtml).toContain('Ctrl+J');
    expect(onboardingHtml).toContain('ピンチ操作');
    expect(onboardingHtml).toContain('ダブルタップ');
  });
});

describe('injectTerminalUi', () => {
  test('injects WebSocket interception script in <head>', () => {
    const html = '<html><head></head><body></body></html>';
    const result = injectTerminalUi(html, '/ttyd-mux');

    // WebSocket interception should be injected right after <head>
    expect(result).toContain('<head>\n<script>');
    expect(result).toContain('window.__TTYD_WS__');
    expect(result).toContain('OriginalWebSocket');
  });

  test('injects styles, HTML, config, and script tag before </body>', () => {
    const html = '<html><head></head><body><p>content</p></body></html>';
    const result = injectTerminalUi(html, '/ttyd-mux');

    expect(result).toContain('<style>');
    expect(result).toContain('#tui');
    expect(result).toContain('window.__TERMINAL_UI_CONFIG__');
    expect(result).toContain('<script src="/ttyd-mux/terminal-ui.js"></script>');
    expect(result).toContain('</body>');
  });

  test('preserves original HTML content', () => {
    const html = '<html><head><title>Test</title></head><body><p>Hello World</p></body></html>';
    const result = injectTerminalUi(html, '/ttyd-mux');

    expect(result).toContain('<title>Test</title>');
    expect(result).toContain('<p>Hello World</p>');
  });

  test('handles HTML without body closing tag', () => {
    const html = '<html><head></head><body><p>content</p>';
    const result = injectTerminalUi(html, '/ttyd-mux');

    // Should inject WebSocket interception in <head> even if </body> is missing
    expect(result).toContain('window.__TTYD_WS__');
    // Body injection should not happen (no </body> to replace)
    expect(result).not.toContain('terminal-ui.js');
  });

  test('only replaces first </body> tag', () => {
    const html = '<html><body>content</body></html>';
    const result = injectTerminalUi(html, '/ttyd-mux');

    const bodyCloseCount = (result.match(/<\/body>/g) || []).length;
    expect(bodyCloseCount).toBe(1);
  });

  test('uses provided basePath in script src', () => {
    const html = '<html><body></body></html>';
    const result = injectTerminalUi(html, '/custom-path');

    expect(result).toContain('<script src="/custom-path/terminal-ui.js"></script>');
  });

  test('includes onboarding HTML', () => {
    const html = '<html><body></body></html>';
    const result = injectTerminalUi(html, '/ttyd-mux');

    expect(result).toContain('id="tui-onboarding"');
  });

  test('onboarding HTML is hidden by default', () => {
    const html = '<html><body></body></html>';
    const result = injectTerminalUi(html, '/ttyd-mux');

    expect(result).toContain('style="display:none"');
  });

  test('script tag appears before </body>', () => {
    const html = '<html><body></body></html>';
    const result = injectTerminalUi(html, '/ttyd-mux');

    const scriptIndex = result.indexOf('terminal-ui.js');
    const bodyIndex = result.indexOf('</body>');
    expect(scriptIndex).toBeLessThan(bodyIndex);
  });

  test('embeds default config as JSON when no config provided', () => {
    const html = '<html><body></body></html>';
    const result = injectTerminalUi(html, '/ttyd-mux');

    expect(result).toContain(`"font_size_min":${DEFAULT_TERMINAL_UI_CONFIG.font_size_min}`);
    expect(result).toContain(`"font_size_max":${DEFAULT_TERMINAL_UI_CONFIG.font_size_max}`);
    expect(result).toContain(`"double_tap_delay":${DEFAULT_TERMINAL_UI_CONFIG.double_tap_delay}`);
  });

  test('embeds custom config as JSON', () => {
    const html = '<html><body></body></html>';
    const customConfig = {
      font_size_min: 12,
      font_size_max: 64,
      font_size_default_mobile: 28,
      font_size_default_pc: 16,
      double_tap_delay: 400
    };
    const result = injectTerminalUi(html, '/ttyd-mux', customConfig);

    expect(result).toContain('"font_size_min":12');
    expect(result).toContain('"font_size_max":64');
    expect(result).toContain('"font_size_default_mobile":28');
    expect(result).toContain('"font_size_default_pc":16');
    expect(result).toContain('"double_tap_delay":400');
  });

  test('config script appears before terminal-ui.js script', () => {
    const html = '<html><body></body></html>';
    const result = injectTerminalUi(html, '/ttyd-mux');

    const configIndex = result.indexOf('__TERMINAL_UI_CONFIG__');
    const toolbarJsIndex = result.indexOf('terminal-ui.js');
    expect(configIndex).toBeLessThan(toolbarJsIndex);
  });
});

// =============================================================================
// Search functionality tests (Issue #3)
// =============================================================================

describe('toolbar/search - template', () => {
  test('contains search button in toolbar', () => {
    expect(terminalUiHtml).toContain('id="tui-search"');
  });

  test('contains search bar container', () => {
    expect(terminalUiHtml).toContain('id="tui-search-bar"');
  });

  test('contains search input field', () => {
    expect(terminalUiHtml).toContain('id="tui-search-input"');
  });

  test('contains search navigation buttons', () => {
    expect(terminalUiHtml).toContain('id="tui-search-prev"');
    expect(terminalUiHtml).toContain('id="tui-search-next"');
  });

  test('contains search close button', () => {
    expect(terminalUiHtml).toContain('id="tui-search-close"');
  });

  test('contains match count display', () => {
    expect(terminalUiHtml).toContain('id="tui-search-count"');
  });

  test('contains case sensitivity toggle', () => {
    expect(terminalUiHtml).toContain('id="tui-search-case"');
  });

  test('contains regex toggle', () => {
    expect(terminalUiHtml).toContain('id="tui-search-regex"');
  });
});

describe('toolbar/search - styles', () => {
  test('contains search bar styles', () => {
    expect(terminalUiStyles).toContain('#tui-search-bar');
  });

  test('contains search input styles', () => {
    expect(terminalUiStyles).toContain('#tui-search-input');
  });

  test('contains search bar hidden state', () => {
    expect(terminalUiStyles).toContain('#tui-search-bar.hidden');
  });
});

// =============================================================================
// Paste button tests (Issue #11)
// =============================================================================

describe('toolbar/paste - template', () => {
  test('contains paste button in toolbar', () => {
    expect(terminalUiHtml).toContain('id="tui-paste"');
  });

  test('paste button has correct title', () => {
    expect(terminalUiHtml).toContain('title="スマートペースト（テキスト/画像を自動判別） Alt+V"');
  });

  test('paste button uses clipboard emoji', () => {
    expect(terminalUiHtml).toContain('📋');
  });
});

// =============================================================================
// Snippet functionality tests (Issue #11)
// =============================================================================

describe('toolbar/snippet - template', () => {
  test('contains snippet button in toolbar', () => {
    expect(terminalUiHtml).toContain('id="tui-snippet"');
  });

  test('snippet button has correct title', () => {
    expect(terminalUiHtml).toContain('title="スニペット"');
  });

  test('snippet button uses pin emoji', () => {
    expect(terminalUiHtml).toContain('📌');
  });

  test('contains snippet modal container', () => {
    expect(terminalUiHtml).toContain('id="tui-snippet-modal"');
  });

  test('snippet modal is hidden by default', () => {
    expect(terminalUiHtml).toContain('id="tui-snippet-modal" class="hidden"');
  });

  test('contains snippet modal header', () => {
    expect(terminalUiHtml).toContain('id="tui-snippet-modal-header"');
  });

  test('contains snippet add button', () => {
    expect(terminalUiHtml).toContain('id="tui-snippet-add"');
  });

  test('contains snippet import button', () => {
    expect(terminalUiHtml).toContain('id="tui-snippet-import"');
  });

  test('contains snippet export button', () => {
    expect(terminalUiHtml).toContain('id="tui-snippet-export"');
  });

  test('contains snippet search input', () => {
    expect(terminalUiHtml).toContain('id="tui-snippet-search"');
  });

  test('contains snippet list container', () => {
    expect(terminalUiHtml).toContain('id="tui-snippet-list"');
  });

  test('contains snippet add form', () => {
    expect(terminalUiHtml).toContain('id="tui-snippet-add-form"');
  });

  test('contains snippet name input', () => {
    expect(terminalUiHtml).toContain('id="tui-snippet-add-name"');
  });

  test('contains snippet command input', () => {
    expect(terminalUiHtml).toContain('id="tui-snippet-add-command"');
  });

  test('contains snippet save button', () => {
    expect(terminalUiHtml).toContain('id="tui-snippet-add-save"');
  });

  test('contains snippet cancel button', () => {
    expect(terminalUiHtml).toContain('id="tui-snippet-add-cancel"');
  });

  test('contains snippet empty state', () => {
    expect(terminalUiHtml).toContain('id="tui-snippet-empty"');
  });
});

describe('toolbar/snippet - styles', () => {
  test('contains snippet modal styles', () => {
    expect(terminalUiStyles).toContain('#tui-snippet-modal');
  });

  test('contains snippet modal content styles', () => {
    expect(terminalUiStyles).toContain('#tui-snippet-modal-content');
  });

  test('contains snippet modal hidden state', () => {
    expect(terminalUiStyles).toContain('#tui-snippet-modal.hidden');
  });

  test('contains snippet search input styles', () => {
    expect(terminalUiStyles).toContain('#tui-snippet-search');
  });

  test('contains snippet add form styles', () => {
    expect(terminalUiStyles).toContain('#tui-snippet-add-form');
  });

  test('contains snippet list styles', () => {
    expect(terminalUiStyles).toContain('#tui-snippet-list');
  });

  test('contains snippet item styles', () => {
    expect(terminalUiStyles).toContain('.tui-snippet-item');
  });

  test('contains snippet item header styles', () => {
    expect(terminalUiStyles).toContain('.tui-snippet-item-header');
  });

  test('contains snippet item name styles', () => {
    expect(terminalUiStyles).toContain('.tui-snippet-item-name');
  });

  test('contains snippet item command styles', () => {
    expect(terminalUiStyles).toContain('.tui-snippet-item-command');
  });

  test('contains snippet item run button styles', () => {
    expect(terminalUiStyles).toContain('.tui-snippet-item-run');
  });

  test('contains snippet item edit button styles', () => {
    expect(terminalUiStyles).toContain('.tui-snippet-item-edit');
  });

  test('contains snippet item delete button styles', () => {
    expect(terminalUiStyles).toContain('.tui-snippet-item-delete');
  });

  test('contains snippet edit form styles', () => {
    expect(terminalUiStyles).toContain('.tui-snippet-item-edit-form');
  });

  test('contains snippet editing state styles', () => {
    expect(terminalUiStyles).toContain('.tui-snippet-item.editing');
  });

  test('contains mobile adjustments for snippet modal', () => {
    expect(terminalUiStyles).toContain('#tui-snippet-modal-content');
  });
});

// =============================================================================
// Clipboard history tests (Issue #11)
// =============================================================================

describe('toolbar/clipboard-history - styles', () => {
  test('contains clipboard history popup styles', () => {
    expect(terminalUiStyles).toContain('#tui-clipboard-history');
  });

  test('contains clipboard history hidden state', () => {
    expect(terminalUiStyles).toContain('#tui-clipboard-history.hidden');
  });

  test('contains clipboard history header styles', () => {
    expect(terminalUiStyles).toContain('#tui-clipboard-history-header');
  });

  test('contains clipboard history list styles', () => {
    expect(terminalUiStyles).toContain('#tui-clipboard-history-list');
  });

  test('contains clipboard history item styles', () => {
    expect(terminalUiStyles).toContain('.tui-clipboard-history-item');
  });

  test('contains clipboard history empty state', () => {
    expect(terminalUiStyles).toContain('#tui-clipboard-history-empty');
  });

  test('contains mobile adjustments for clipboard history', () => {
    expect(terminalUiStyles).toContain('#tui-clipboard-history');
  });
});
