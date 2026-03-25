# ADR-001: WebSocket Proxy Implementation

## Status

Accepted

## Date

2026-02-16

## Context

ttyd-mux acts as a reverse proxy between browsers and ttyd (web terminal) instances. The proxy needs to handle both HTTP requests and WebSocket connections. WebSocket is essential for ttyd's real-time terminal communication.

Initially, we used the `http-proxy` library with its built-in WebSocket support (`proxy.ws()`). However, when running on the Bun runtime, the WebSocket proxy was not functioning correctly.

### Problem Symptoms

1. Browser connects to the proxy and receives HTTP 101 Switching Protocols response
2. Browser reports WebSocket as "opened"
3. No WebSocket frames are received by the browser
4. Connection closes immediately with no data transfer

### Debugging Process

We used Playwright to test both direct ttyd access and proxy access:

**Direct access (working):**
```
[WebSocket] Opened: ws://localhost:7601/ttyd-mux/ttyd-mux/ws
[WebSocket] Sent: {"AuthToken":"","columns":175,"rows":54}
[WebSocket] Received: 1tmux new -A -s ttyd-mux (dev)
```

**Via proxy (not working):**
```
[WebSocket] Opened: ws://localhost:7680/ttyd-mux/ttyd-mux/ws
(no Sent/Received events)
[WebSocket] Closed
```

### Investigation

1. **Raw TCP socket approach**: We tried manually forwarding the WebSocket upgrade using `net.connect()`. The 101 response was forwarded and `socket.write()` returned `true`, but data never reached the browser.

2. **http.request upgrade event**: Node.js's `http.request` with upgrade handling returned the 101 response through the `response` event instead of the `upgrade` event - a Bun compatibility issue.

3. **Root cause**: Bun's HTTP server behavior differs from Node.js when handling WebSocket upgrades. The raw socket obtained from the `upgrade` event does not properly forward data written to it.

## Decision

Replace the `http-proxy` WebSocket handling with the `ws` library, implementing WebSocket-level proxying instead of TCP-level proxying.

### Implementation

```typescript
import WebSocket, { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ noServer: true });

function handleUpgrade(config, req, socket, head) {
  const session = findSessionForPath(config, req.url);
  if (!session) {
    socket.destroy();
    return;
  }

  // Connect to backend at WebSocket protocol level
  const backendWs = new WebSocket(`ws://127.0.0.1:${session.port}${req.url}`, protocols);

  backendWs.on('open', () => {
    // Upgrade client using ws library
    wss.handleUpgrade(req, socket, head, (clientWs) => {
      // Forward messages bidirectionally
      clientWs.on('message', (data, isBinary) => {
        if (backendWs.readyState === WebSocket.OPEN) {
          backendWs.send(data, { binary: isBinary });
        }
      });

      backendWs.on('message', (data, isBinary) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data, { binary: isBinary });
        }
      });

      // Cleanup handling with closed flag to prevent double-close
      let closed = false;
      const cleanup = (initiator, code, reason) => {
        if (closed) return;
        closed = true;
        // Close/terminate the other side
      };

      clientWs.on('close', (code, reason) => cleanup('client', code, reason));
      backendWs.on('close', (code, reason) => cleanup('backend', code, reason));
      clientWs.on('error', () => { clientWs.terminate(); cleanup('client', 1006); });
      backendWs.on('error', () => { backendWs.terminate(); cleanup('backend', 1006); });
    });
  });
}
```

## Consequences

### Positive

- WebSocket proxying works correctly on Bun runtime
- Proper WebSocket protocol handling (not raw TCP)
- Binary and text message types are preserved
- Clean connection lifecycle management
- No zombie connections due to proper cleanup

### Negative

- Additional dependency (`ws` library)
- Slight overhead from WebSocket frame parsing/re-encoding (negligible for terminal use)

### Neutral

- `http-proxy` is still used for HTTP request proxying
- The architecture separates HTTP and WebSocket handling

## Alternatives Considered

1. **Raw TCP socket piping**: Did not work with Bun's HTTP server upgrade handling
2. **http.request with upgrade event**: Bun fires `response` event instead of `upgrade` for 101 responses
3. **Bun's native WebSocket**: Would require rewriting the HTTP server; `ws` library provides compatibility layer

## References

- [ws library documentation](https://github.com/websockets/ws)
- [http-proxy WebSocket support](https://github.com/http-party/node-http-proxy#proxying-websockets)
- [Bun HTTP server](https://bun.sh/docs/api/http)
