# ADR 032: Smart Clipboard Feature

## Status

Accepted

## Context

Users working with AI assistants like Claude Code often need to share screenshots or images with the terminal. The existing paste button only supported text, requiring users to manually save images and type file paths.

Key requirements:
1. **Smart detection** - Automatically detect clipboard content type (text vs image)
2. **Image paste** - Save images to session directory and send path to terminal
3. **Preview modal** - Show image preview before upload
4. **Drag & drop** - Support dropping images onto the terminal
5. **Multiple images** - Handle multiple images in one operation

## Decision

Implement a SmartPasteManager that extends the existing paste functionality with content-type detection and image handling.

### Content Detection

Use the Clipboard API's `read()` method to detect content types:

```typescript
async smartPaste(): Promise<boolean> {
  const items = await navigator.clipboard.read();

  for (const item of items) {
    // Check for images first
    for (const type of item.types) {
      if (type.startsWith('image/')) {
        // Handle as image
        return this.handleImage(blob);
      }
    }
  }

  // Fall back to text paste
  return this.handleText();
}
```

### Behavior Matrix

| Clipboard Content | Action |
|-------------------|--------|
| Text | Send directly to terminal (existing behavior) |
| Image (single) | Show preview modal → Upload → Send path |
| Images (multiple) | Show preview with navigation → Upload all → Send paths |
| HTML | Extract text and send to terminal |

### Preview Modal UI

```
┌─────────────────────────────────────────────────────────────┐
│ 画像プレビュー                                    [×]      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                   [画像表示]                                │
│                                                             │
│                    ○ ● ○ ○  (4枚中2枚目)                   │
│                                                             │
│  [◀ 前へ]                                      [次へ ▶]   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [削除]                 [キャンセル]         [送信 (4枚)]   │
└─────────────────────────────────────────────────────────────┘
```

### Drag & Drop

Full-screen drop zone overlay when dragging files:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    ┌─────────────────┐                      │
│                    │  📁 ここに画像を │                      │
│                    │   ドロップ       │                      │
│                    └─────────────────┘                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Architecture

### New Components

```
src/daemon/toolbar/client/
└── SmartPasteManager.ts    # Smart paste logic and preview modal

src/daemon/
└── file-transfer.ts        # saveClipboardImages() function (added)
```

### API Endpoint

```
POST /api/clipboard-image?session=<name>

Request:
{
  "images": [
    { "data": "<base64>", "mimeType": "image/png", "name": "optional.png" }
  ]
}

Response:
{
  "success": true,
  "paths": ["clipboard-20260219-123456.png"]
}
```

### File Naming Convention

Images are saved with timestamp-based names:

```
clipboard-{YYYYMMDD}-{HHMMSS}.{ext}
clipboard-{YYYYMMDD}-{HHMMSS}-002.{ext}  // Multiple images
clipboard-{YYYYMMDD}-{HHMMSS}-003.{ext}
```

### Component Integration

```
┌─────────────────────────────────────────────────────────────┐
│                        ToolbarApp                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  SmartPasteManager                   │   │
│  │  - Clipboard API read()                              │   │
│  │  - Content type detection                            │   │
│  │  - Preview modal                                     │   │
│  │  - Drag & drop                                       │   │
│  │  - Image upload                                      │   │
│  └────────────────────────┬────────────────────────────┘   │
│                           │                                  │
│           ┌───────────────┼───────────────┐                 │
│           ▼               ▼               ▼                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐    │
│  │InputHandler│  │ClipboardHis│  │ API Server         │    │
│  │sendText()  │  │toryManager │  │ /api/clipboard-    │    │
│  └────────────┘  │addToHistory│  │ image              │    │
│                  └────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+V | Smart paste (image-aware) |
| Arrow keys | Navigate preview images |
| Enter | Submit images |
| Escape | Close preview |
| Delete/Backspace | Remove current image |

## Security Considerations

### Clipboard API Requirements

- **HTTPS required**: Enforced by proxy mode
- **User gesture required**: Button click or keyboard shortcut
- **Permission prompt**: Browser may show permission dialog (Safari)

### File Upload Security

- Uses existing file transfer configuration (max_file_size)
- No path traversal possible (files saved to session root)
- MIME type validation (must start with `image/`)
- Base64 decoding happens server-side

### Firefox Compatibility

Firefox doesn't support `ClipboardItem` in `navigator.clipboard.read()`. Fallback:
- Text paste works via `navigator.clipboard.readText()`
- Image paste requires user to use drag & drop instead

## Consequences

### Positive

- Seamless workflow for sharing screenshots with AI assistants
- Works with existing file transfer configuration
- Preserves existing text paste behavior (no breaking changes)
- Multiple image support reduces repetitive actions
- Drag & drop provides alternative input method
- Preview before upload prevents accidental sends

### Negative

- Increases toolbar.js bundle size (~2KB gzipped)
- Requires HTTPS (already required for proxy mode)
- Firefox users must use drag & drop for images
- Large images may take time to upload over slow connections

## Testing

Unit tests added for:
- `saveClipboardImages()` function
  - Single/multiple image saving
  - Custom filename support
  - MIME type → extension mapping
  - Size limit enforcement
  - Error handling

Browser testing required for:
- Clipboard API integration
- Preview modal interactions
- Drag & drop functionality
- Cross-browser compatibility

## Future Improvements

- Image compression/resize option before upload
- Image annotation/cropping
- Paste image directly into Claude Code prompt
- Support for non-image files via clipboard
- Clipboard history for images

## Related

- ADR 030: Clipboard and snippet feature
- ADR 031: File transfer feature
- ADR 015: Toolbar module architecture
