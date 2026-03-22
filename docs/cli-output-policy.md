# CLI Output Policy

This document defines the output conventions for bunterm CLI commands.

## Principles

1. **No silent success**: Always output something on success
2. **Actionable hints**: On error or empty state, suggest next steps
3. **Consistent terminology**: Use same phrases for same concepts
4. **Machine-parseable option**: Support `--json` where applicable

## Output Categories

### Success Messages

```
Session started: <name>
URL: <url>

Share created for session '<name>':
<url>

Daemon restarted successfully
```

### Status/Info Messages

```
Daemon: running (port: <port>)
Sessions (<count>):
  <name>: <url>

No active sessions.
```

### Warning Messages

```
Note: <explanation>
Settings requiring daemon restart:
  - <setting>
Run "bunterm <command>" to apply these changes.
```

### Error Messages (via CliError)

```
Error: <message>
```

## Formatting Rules

### Lists

Use 2-space indentation for list items:

```
Sessions (2):
  myproject: http://localhost:7601/bunterm/myproject
  another: http://localhost:7602/bunterm/another
```

### Empty State

Always explain the empty state and suggest action:

```
No active sessions.
Run "bunterm up" to start a session.
```

### Already Running / Exists

```
Session '<name>' is already running.
URL: <url>

Route already exists for <host><path>
```

### Stopped / Removed

```
Session '<name>' stopped
Daemon stopped (no remaining sessions)
Share '<token>' revoked
```

## JSON Output

When `--json` is available:

```bash
bunterm list --json
bunterm status --json
bunterm share list --json
```

Output should be valid JSON to stdout. Errors go to stderr.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Resource not found |
| 4 | Already exists |

## Commands Checklist

| Command | Success Output | Empty Output | JSON |
|---------|---------------|--------------|------|
| up | Session started: X | - | - |
| down | Session stopped | Session not found | - |
| list | List of sessions | No active sessions | Planned |
| status | Status details | Daemon not running | Planned |
| doctor | Check results | - | Planned |
| share | URL | - | - |
| share list | List of shares | No active shares | Yes |
| reload | Reloaded settings | Config unchanged | Planned |
| caddy status | Routes list | No routes found | Planned |
