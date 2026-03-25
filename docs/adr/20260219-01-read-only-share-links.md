# ADR 026: Read-only Share Links

## Status

Accepted

## Context

Issue #2 requested the ability to share terminal sessions with others in a read-only mode. This is useful for:
- Demo presentations
- Debugging assistance
- Code review
- Pair programming observation

Sharing full authentication credentials is a security risk, so a token-based read-only access mechanism was needed.

## Decision

Implement a token-based share system with the following components:

### 1. Share Token Management

- Tokens are 32-character hex strings generated using `crypto.randomBytes()`
- Tokens are stored in `state.json` with expiration timestamps
- Default expiration: 1 hour (configurable via `--expires` flag)

### 2. URL Structure

```
https://example.com/ttyd-mux/share/<token>
```

- Token does not expose session name (security feature)
- Expired/revoked tokens return 403 Forbidden

### 3. Read-only Mode Implementation

The WebSocket proxy filters messages based on ttyd protocol:
- ttyd uses binary messages with command byte as first byte
- Command byte `0x30` ('0') indicates input from client
- In read-only mode, input messages are dropped at the proxy level
- Output messages continue to flow normally

### 4. CLI Commands

```bash
ttyd-mux share create <session> [--expires 1h]
ttyd-mux share list [--json]
ttyd-mux share revoke <token>
```

### 5. API Endpoints

```
POST   /api/shares         - Create share
GET    /api/shares         - List shares
GET    /api/shares/:token  - Validate share
DELETE /api/shares/:token  - Revoke share
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         State.json                          │
│  { shares: [{ token, sessionName, expiresAt, ... }] }      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      ShareManager                           │
│  createShare() │ validateShare() │ revokeShare()           │
└─────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   CLI Command   │  │   API Handler   │  │     Router      │
│  share create   │  │  POST /shares   │  │  /share/:token  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
                                                   │
                                                   ▼
                              ┌─────────────────────────────────┐
                              │       WebSocket Proxy           │
                              │  readOnly: true → block input   │
                              └─────────────────────────────────┘
```

## Consequences

### Positive

- Secure token-based access without exposing session names
- Automatic expiration reduces risk of stale shares
- Read-only enforcement at protocol level (cannot be bypassed)
- Simple CLI and API for share management
- DI-ready architecture for testing

### Negative

- Shares are stored in state.json (file lock on every operation)
- No persistence across daemon restarts (shares in state.json persist, but sessions may not)
- No password protection in this release (planned for future)

## Notes

### Related Issue

- #2 Read-only share links for session viewing

### ttyd Protocol

ttyd uses a binary WebSocket protocol:
- Byte 0: Command type
  - `'0'` (0x30): Input from client
  - `'1'` (0x31): Output to client
  - `'2'` (0x32): Set window title
  - `'3'` (0x33): Set preferences
  - `'4'` (0x34): Set reconnect

### Future Improvements

- Password protection for shares
- Access logging
- Rate limiting
- QR code generation
