# ADR 031: File Transfer Feature

## Status

Accepted

## Context

Issue #6 requested file upload and download functionality for terminal sessions. Key requirements:

1. **Download files** - Browse session directory and download files
2. **Upload files** - Upload files to the session directory
3. **Security** - Prevent path traversal attacks
4. **Mobile-friendly** - Touch-optimized file browser UI
5. **Configuration** - File size limits and extension filtering

## Decision

Implement a full-stack file transfer system with TDD approach:

### Backend API

Three new REST endpoints:

```
GET  /api/files/download?session=<name>&path=<path>
POST /api/files/upload?session=<name>&path=<path>
GET  /api/files/list?session=<name>&path=<path>
```

### Security Measures

1. **Path validation**: Reject paths with `..`, absolute paths, null bytes, and URL-encoded traversal
2. **Directory containment**: Verify resolved path stays within session's base directory
3. **File size limits**: Configurable max file size (default: 100MB)
4. **Extension filtering**: Optional whitelist of allowed file extensions
5. **Enable/disable toggle**: Feature can be disabled entirely

### Frontend UI

Toolbar buttons and file browser modal:

```
Toolbar: [...][📥][📤]...
              ↑Download ↑Upload

┌─────────────────────────────────────────┐
│ ファイルブラウザ           [📤]    [×]  │
├─────────────────────────────────────────┤
│ 🏠 / src / components                   │
├─────────────────────────────────────────┤
│ 📁 ..                                   │
│ 📁 utils                        　      │
│ 📄 index.ts                     1.2 KB  │
│ 📄 App.tsx                      3.4 KB  │
└─────────────────────────────────────────┘
```

## Architecture

### Backend Files

```
src/daemon/
├── file-transfer.ts          # FileTransferManager (core logic)
├── file-transfer.test.ts     # 32 unit tests
├── file-transfer-api.ts      # HTTP handlers
├── file-transfer-api.test.ts # 14 API tests
└── api-handler.ts            # API endpoint integration
```

### Frontend Files

```
src/daemon/toolbar/
├── template.ts               # Modal HTML
├── styles.ts                 # Modal CSS
└── client/
    └── FileTransferManager.ts # Browser-side logic
```

### FileTransferManager Interface

```typescript
interface FileTransferManager {
  downloadFile(relativePath: string): Promise<DownloadResult>;
  uploadFile(relativePath: string, content: Buffer): Promise<UploadResult>;
  listFiles(relativePath: string): Promise<ListResult>;
}

interface DownloadResult {
  success: boolean;
  data?: Buffer;
  filename?: string;
  mimeType?: string;
  error?: FileTransferError;
}

interface UploadResult {
  success: boolean;
  path?: string;
  error?: FileTransferError;
}

interface ListResult {
  success: boolean;
  files?: FileInfo[];
  error?: FileTransferError;
}
```

### Configuration

```yaml
# config.yaml
file_transfer:
  enabled: true
  max_file_size: 104857600  # 100MB
  allowed_extensions: []     # Empty = all allowed
```

```typescript
// Zod schema
const FileTransferConfigSchema = z.object({
  enabled: z.boolean().default(true),
  max_file_size: z.number().int().min(1024).default(100 * 1024 * 1024),
  allowed_extensions: z.array(z.string()).default([])
});
```

### Path Validation

```typescript
function isPathSafe(path: string): boolean {
  // Reject empty paths
  if (!path || path.length === 0) return false;

  // Reject null bytes
  if (path.includes('\x00')) return false;

  // Reject absolute paths
  if (path.startsWith('/')) return false;

  // Reject path traversal
  const normalized = normalize(path);
  if (normalized.includes('..')) return false;

  // Reject URL-encoded traversal
  if (path.includes('%2e') || path.includes('%2E')) return false;

  return true;
}

function resolveFilePath(baseDir: string, relativePath: string): string | null {
  if (!isPathSafe(relativePath)) return null;

  const resolvedBase = resolve(baseDir);
  const resolvedPath = resolve(baseDir, relativePath);

  // Ensure path stays within base directory
  if (!resolvedPath.startsWith(resolvedBase)) return null;

  return resolvedPath;
}
```

### MIME Type Detection

Built-in mapping for common file types:

```typescript
const MIME_TYPES: Record<string, string> = {
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.ts': 'text/typescript',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  // ... and more
};
```

### Error Handling

```typescript
type FileTransferError =
  | 'not_found'           // 404
  | 'invalid_path'        // 400
  | 'file_too_large'      // 413
  | 'disabled'            // 403
  | 'extension_not_allowed' // 403
  | 'permission_denied'   // 403
  | 'unknown';            // 500
```

## Test Coverage

### Unit Tests (32 tests)

- Path validation (isPathSafe, resolveFilePath)
- File operations (download, upload, list)
- Error conditions (not found, too large, disabled)
- Extension filtering

### API Tests (14 tests)

- HTTP handlers
- Response status codes
- Multipart form data parsing
- Binary content handling

## Consequences

### Positive

- Secure by design (multiple layers of path validation)
- TDD approach ensures high test coverage
- Configurable limits prevent abuse
- Seamless integration with existing toolbar
- Mobile-friendly file browser UI

### Negative

- Files must be within session directory (by design)
- Large file uploads may be slow over mobile connections
- No progress indicator for uploads (future enhancement)

## Future Improvements

- Upload progress bar
- Drag-and-drop upload
- File preview (images, text)
- Multi-file selection
- Directory creation
- File deletion

## Related

- Issue #6: File upload and download feature request
- ADR 013: Security hardening
- ADR 015: Toolbar module architecture
