# ADR 030: Clipboard and Snippet Feature

## Status

Accepted

## Context

Issue #11 requested clipboard and snippet functionality for mobile users. Key requirements:

1. **Paste button** - Quick paste from system clipboard to terminal
2. **Clipboard history** - Access to recent paste entries (mobile devices don't have clipboard managers)
3. **Command snippets** - Save and reuse frequently used commands
4. **Mobile-friendly** - All features must work well on touch devices

## Decision

Implement a three-phase feature set:

### Phase 1: Paste Button

Simple paste functionality using the Clipboard API.

```
Toolbar: [Copy][All][📋]...
                  ↑ Paste
```

- Uses `navigator.clipboard.readText()` for secure clipboard access
- Requires HTTPS (already enforced in proxy mode)
- Requires user gesture (button click satisfies this)

### Phase 2: Snippet Management

A modal-based snippet manager with CRUD operations.

```
┌─────────────────────────────────────────┐
│ 📌 スニペット     [📥][📤][+]    [×]  │
├─────────────────────────────────────────┤
│ [🔍 スニペットを検索...]               │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ Docker Node              [▶][✎][🗑] │ │
│ │ docker run -it node:latest         │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

Features:
- Add/Edit/Delete snippets
- Run snippet (sends command to terminal)
- Search by name or command
- Import/Export as JSON

### Phase 3: Clipboard History

Long-press paste button to show clipboard history.

```
┌────────────────────────┐
│ 履歴              [×]  │
├────────────────────────┤
│ npm install            │
│ git status && git...   │
│ docker ps -a           │
└────────────────────────┘
```

Features:
- Maximum 10 items
- Triggered by long-press (500ms)
- Click item to paste

## Architecture

### New Files

```
src/daemon/toolbar/client/
├── SnippetManager.ts       # Snippet CRUD and modal UI
└── ClipboardHistoryManager.ts  # Clipboard history popup
```

### Data Storage

Both features use localStorage for persistence:

```typescript
// Snippets
interface SnippetStorage {
  version: 1;
  snippets: Array<{
    id: string;        // UUID-like identifier
    name: string;      // Display name
    command: string;   // Command text
    createdAt: string; // ISO timestamp
  }>;
}

// Clipboard History
interface ClipboardHistoryStorage {
  version: 1;
  items: Array<{
    id: string;
    text: string;
    timestamp: string;
  }>;
}
```

### Storage Keys

```typescript
const STORAGE_KEYS = {
  SNIPPETS: 'ttyd-mux-snippets',
  CLIPBOARD_HISTORY: 'ttyd-mux-clipboard-history',
} as const;
```

### Component Integration

```
┌─────────────────────────────────────────────────────────────┐
│                        ToolbarApp                           │
│                                                             │
│  ┌─────────────────┐  ┌──────────────────┐                 │
│  │ SnippetManager  │  │ClipboardHistory  │                 │
│  │                 │  │    Manager       │                 │
│  │ - CRUD          │  │ - Long press     │                 │
│  │ - Search        │  │ - History popup  │                 │
│  │ - Import/Export │  │ - Paste from     │                 │
│  └────────┬────────┘  └────────┬─────────┘                 │
│           │                    │                            │
│           ▼                    ▼                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    InputHandler                      │   │
│  │                    sendText()                        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Mobile Considerations

### Clipboard API Constraints

- **HTTPS required**: Enforced by proxy mode
- **User gesture required**: Satisfied by button click
- **Permission may be denied**: Error handling with console log

### Touch-Friendly Design

- Minimum tap target: 44x44px
- Font size 16px (prevents iOS auto-zoom)
- Long-press delay: 500ms
- Backdrop tap to close modals

## Import/Export Format

JSON format for snippet sharing:

```json
{
  "version": 1,
  "snippets": [
    {
      "id": "1234567890-abc123",
      "name": "Docker Node",
      "command": "docker run -it node:latest bash",
      "createdAt": "2026-02-19T10:00:00.000Z"
    }
  ]
}
```

## Consequences

### Positive

- No server-side changes required (all client-side)
- Works offline after initial page load
- Data persists in browser localStorage
- Export/Import enables snippet sharing between devices
- Long-press pattern familiar to mobile users

### Negative

- localStorage has 5MB limit (sufficient for thousands of snippets)
- Data not synced across devices (by design - security)
- Clipboard history only captures pastes through our button

## Future Improvements

- Snippet categories/tags
- Snippet ordering/pinning
- Cloud sync (opt-in)
- Snippet variables/templates
- Keyboard shortcuts for snippets

## Related

- Issue #11: Clipboard & snippet feature request
- ADR 015: Toolbar module architecture
- ADR 003: Mobile input enhancements
