# ADR 025: Scrollback Buffer Search

## Status

Accepted

## Context

Issue #3 requested the ability to search within the terminal scrollback buffer. When monitoring long-running sessions (especially AI coding assistants), users need to find specific text like error messages, commands, or function names.

The current approach requires manually scrolling through the entire buffer, which is time-consuming and error-prone.

## Decision

Implement scrollback search using xterm.js's official `@xterm/addon-search` addon, loaded from CDN.

### Implementation Details

1. **CDN-based addon loading**: Load `@xterm/addon-search` from jsDelivr CDN instead of bundling
   - Reduces initial bundle size
   - Lazy loading: only loaded when search is first used
   - Version pinned to 0.15.0 for stability

2. **Search UI placement**: Fixed position at top of viewport
   - Doesn't overlap with terminal content
   - Consistent with browser search conventions (Ctrl+F behavior)

3. **Keyboard shortcuts**:
   - `Ctrl+Shift+F`: Toggle search bar (avoids conflict with browser's Ctrl+F)
   - `Enter` / `F3`: Find next
   - `Shift+Enter` / `Shift+F3`: Find previous
   - `Escape`: Close search bar

4. **Mobile support**: Search button added to toolbar for touch devices

### Code Structure

```
src/daemon/toolbar/
├── template.ts   # Search bar HTML elements
├── styles.ts     # Search bar CSS
└── index.ts      # Search functionality (toggleSearchBar, findNext, findPrevious)
```

### Alternatives Considered

1. **Bundle the addon with the application**
   - Pro: No CDN dependency
   - Con: Increases bundle size for all users, even those who don't use search
   - Rejected: CDN approach is more efficient

2. **Custom search implementation using buffer API**
   - Pro: No external dependency
   - Con: More complex, potentially less optimized
   - Rejected: Official addon is well-maintained and optimized

3. **Use tmux's built-in search**
   - Pro: No implementation needed
   - Con: Requires tmux knowledge, inconsistent UX
   - Rejected: Want web-native experience

## Consequences

### Positive

- Users can quickly find text in scrollback buffer
- Consistent keyboard shortcuts with browser conventions
- Lazy loading minimizes initial page load impact
- Mobile-friendly with toolbar button

### Negative

- Requires CDN connectivity for first search use
- Potential version compatibility issues with ttyd's bundled xterm.js
- Match count is approximate (manual calculation, not from addon)

## Notes

### Related Issue

- #3 Search within scrollback buffer

### xterm-addon-search API

```typescript
searchAddon.findNext(term: string, options?: ISearchOptions): boolean;
searchAddon.findPrevious(term: string, options?: ISearchOptions): boolean;
searchAddon.clearDecorations(): void;
```
