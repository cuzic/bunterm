# ADR 027: Push Notifications for Terminal Output Patterns

## Status

Accepted

## Context

Issue #1 requested push notification support to alert users when terminal output matches specific patterns. This is particularly useful for monitoring AI coding assistants where users need to know when questions are asked or errors occur.

## Decision

Implement Web Push notifications using the Web Push API and service workers.

### Configuration

```yaml
# config.yaml
notifications:
  enabled: true
  contact_email: webmaster@example.com
  bell_notification: true   # Default: true - notify on terminal bell (\x07)
  bell_cooldown: 10         # Default: 10 seconds
  default_cooldown: 300     # 5 minutes for custom patterns
  patterns:                 # Additional custom patterns (optional)
    - regex: '\?\s*$'
      message: "Question detected"
      cooldown: 60
    - regex: '\[Y/n\]'
      message: "Confirmation required"
    - regex: 'ERROR|Error|error'
      message: "Error detected"
```

### Default Bell Notification

By default, notifications are triggered when the terminal outputs a bell character (`\x07`, ASCII BEL). This is useful because:

1. **AI coding assistants** (Claude Code, etc.) ring the bell when they need user attention
2. **Build tools** often use bell to signal completion
3. **Shell prompts** can be configured to ring bell after long-running commands
4. **No configuration needed** - works out of the box

To disable bell notifications:
```yaml
notifications:
  bell_notification: false
```

#### Bell Detection Architecture

Bell detection uses a dual approach:

1. **Server-side detection** (for push notifications):
   - WebSocket proxy monitors output messages for `\x07` byte
   - Works even when browser tab is closed or user is away
   - Triggers push notification with cooldown

2. **Client-side detection** (for visual feedback):
   - Uses xterm.js `term.onBell()` event
   - Shows visual bell effect (screen flash)
   - Only works when terminal tab is open

This ensures push notifications work reliably while also providing immediate visual feedback when viewing the terminal.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WebSocket Proxy                          │
│  (monitors output messages from backend)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (ttyd output byte '1')
┌─────────────────────────────────────────────────────────────┐
│                  Output Buffer / Decoder                    │
│  (accumulates text, splits lines)                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Pattern Matcher                           │
│  (checks regex patterns with cooldown)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (match found)
┌─────────────────────────────────────────────────────────────┐
│                  Notification Sender                        │
│  (sends via web-push library)                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Push Service                             │
│  (FCM, Mozilla Autopush, Apple Push)                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Service Worker                            │
│  (shows notification, handles click)                        │
└─────────────────────────────────────────────────────────────┘
```

### Components

1. **VAPID Keys** (`notification/vapid.ts`)
   - Generated once and stored in state directory
   - Public key shared with clients for subscription
   - Private key used to sign push messages

2. **Subscription Manager** (`notification/subscription.ts`)
   - Stores browser push subscriptions
   - Supports session-specific subscriptions
   - Auto-removes expired subscriptions

3. **Pattern Matcher** (`notification/matcher.ts`)
   - Compiles regex patterns at startup
   - Per-session, per-pattern cooldown tracking
   - Prevents notification spam

4. **Notification Sender** (`notification/sender.ts`)
   - Uses `web-push` npm package
   - Handles push service errors
   - Cleans up invalid subscriptions

5. **Service Worker** (`pwa.ts`)
   - Handles `push` events
   - Shows notifications with session info
   - Focuses existing window on click

### API Endpoints

```
GET    /api/notifications/vapid-key      - Get public VAPID key
POST   /api/notifications/subscribe      - Subscribe to notifications
DELETE /api/notifications/subscribe/:id  - Unsubscribe
GET    /api/notifications/subscriptions  - List subscriptions
POST   /api/notifications/bell           - Trigger bell notification (from client)
```

### Toolbar Subscription UI

The toolbar includes a notification toggle button (🔔/🔕):

1. **Click the bell icon** in the toolbar
2. Browser requests notification permission
3. If granted, subscribes to push notifications
4. Button shows 🔔 (active) when subscribed
5. Click again to unsubscribe (shows 🔕)

Subscription state is persisted in localStorage.

### Client Integration (Programmatic)

Browser subscribes to notifications:

```javascript
// 1. Get VAPID key
const { publicKey } = await fetch('/ttyd-mux/api/notifications/vapid-key').then(r => r.json());

// 2. Request notification permission
const permission = await Notification.requestPermission();

// 3. Subscribe via Push API
const registration = await navigator.serviceWorker.ready;
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(publicKey)
});

// 4. Send subscription to server
await fetch('/ttyd-mux/api/notifications/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    endpoint: subscription.endpoint,
    keys: {
      p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))),
      auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth'))))
    }
  })
});
```

## Consequences

### Positive

- Real-time notifications without polling
- Works even when browser tab is in background
- Pattern-based filtering reduces noise
- Cooldown prevents notification spam
- Session-specific subscriptions for multi-session users

### Negative

- Requires HTTPS in production (browser requirement)
- Push services (FCM, etc.) are external dependencies
- VAPID key management adds complexity
- Safari has unique Web Push requirements

### Limitations

- Browser must be open (even in background) for notifications
- Mobile notification support varies by browser
- Some corporate networks block push services

## Notes

### Related Issue

- #1 Push notifications when terminal output matches pattern

### Dependencies

- `web-push` npm package (v3.6.7)

### ttyd Protocol

Output messages use binary format:
- Byte 0: `0x31` ('1') = output command
- Bytes 1+: UTF-8 encoded terminal output

### Future Improvements

- Client-side UI for subscription management
- Pattern testing UI
- Notification sound customization
- Email notification channel
- Webhook notifications (Slack, Discord)
