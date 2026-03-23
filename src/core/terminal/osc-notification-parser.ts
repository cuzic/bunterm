/**
 * OSC Notification Parser - Parse OSC 9/99/777 notification sequences
 *
 * Terminal emulators use these sequences for desktop notifications:
 * - OSC 9: Simple notification (iTerm2/ConEmu)
 *   Format: ESC ] 9 ; <message> (BEL | ST)
 *
 * - OSC 777: Notification with title (rxvt-unicode)
 *   Format: ESC ] 777 ; notify ; <title> ; <body> (BEL | ST)
 *
 * - OSC 99: Kitty notification protocol
 *   Format: ESC ] 99 ; [<params>] ; <body> (BEL | ST)
 */

export interface OscNotification {
  type: 'osc9' | 'osc99' | 'osc777';
  title?: string;
  body: string;
}

export interface OscNotificationParseResult {
  /** Output text with notification OSC sequences removed */
  filteredOutput: string;
  /** Parsed notifications */
  notifications: OscNotification[];
}

// OSC notification prefixes to detect
const OSC_9_PREFIX = '\x1b]9;';
const OSC_99_PREFIX = '\x1b]99;';
const OSC_777_PREFIX = '\x1b]777;';
// OSC 633 prefix — must NOT be consumed by this parser
const OSC_633_PREFIX = '\x1b]633;';

const BEL = '\x07';

/**
 * Find the end of an OSC sequence (BEL or ST terminator).
 * Returns the index after the terminator, or -1 if not found.
 */
function findOscEnd(text: string, startIndex: number): { endIndex: number; terminatorLen: number } {
  let i = startIndex;
  while (i < text.length) {
    if (text[i] === BEL) {
      return { endIndex: i, terminatorLen: 1 };
    }
    if (text[i] === '\x1b' && i + 1 < text.length && text[i + 1] === '\\') {
      return { endIndex: i, terminatorLen: 2 };
    }
    i++;
  }
  return { endIndex: -1, terminatorLen: 0 };
}

/**
 * Parse OSC 9 content: just a message body
 */
function parseOsc9(content: string): OscNotification {
  return { type: 'osc9', body: content };
}

/**
 * Parse OSC 777 content: notify;<title>;<body>
 * Only handles "notify" subcommand.
 */
function parseOsc777(content: string): OscNotification | null {
  // Format: notify;title;body
  const firstSemicolon = content.indexOf(';');
  if (firstSemicolon === -1) {
    return null;
  }

  const subcommand = content.slice(0, firstSemicolon);
  if (subcommand !== 'notify') {
    return null;
  }

  const rest = content.slice(firstSemicolon + 1);
  const secondSemicolon = rest.indexOf(';');
  if (secondSemicolon === -1) {
    return { type: 'osc777', body: rest };
  }

  const title = rest.slice(0, secondSemicolon);
  const body = rest.slice(secondSemicolon + 1);
  return { type: 'osc777', title, body };
}

/**
 * Parse OSC 99 content: [params];body
 * Simplified: extract body after first semicolon (params are key=value pairs).
 */
function parseOsc99(content: string): OscNotification {
  const semicolonIndex = content.indexOf(';');
  if (semicolonIndex === -1) {
    return { type: 'osc99', body: content };
  }
  const body = content.slice(semicolonIndex + 1);
  return { type: 'osc99', body };
}

/**
 * Parse OSC 9/99/777 notification sequences from terminal output.
 *
 * Returns the output with notification sequences removed and
 * a list of parsed notifications. Non-notification OSC sequences
 * (e.g., OSC 633) are preserved in the output.
 */
export function parseOscNotifications(text: string): OscNotificationParseResult {
  const notifications: OscNotification[] = [];
  let filteredOutput = '';
  let i = 0;

  while (i < text.length) {
    // Check for ESC ] start
    if (text[i] === '\x1b' && i + 1 < text.length && text[i + 1] === ']') {
      // Check which OSC prefix matches
      const remaining = text.slice(i);

      // Skip OSC 633 — handled by Osc633Parser
      if (remaining.startsWith(OSC_633_PREFIX)) {
        // Find the end to pass through the entire sequence
        const { endIndex, terminatorLen } = findOscEnd(text, i + OSC_633_PREFIX.length);
        if (endIndex === -1) {
          // Incomplete — pass through remainder
          filteredOutput += text.slice(i);
          break;
        }
        filteredOutput += text.slice(i, endIndex + terminatorLen);
        i = endIndex + terminatorLen;
        continue;
      }

      // OSC 9
      if (remaining.startsWith(OSC_9_PREFIX)) {
        const contentStart = i + OSC_9_PREFIX.length;
        const { endIndex, terminatorLen } = findOscEnd(text, contentStart);
        if (endIndex === -1) {
          // Incomplete sequence — preserve in output
          filteredOutput += text.slice(i);
          break;
        }
        const content = text.slice(contentStart, endIndex);
        notifications.push(parseOsc9(content));
        i = endIndex + terminatorLen;
        continue;
      }

      // OSC 777
      if (remaining.startsWith(OSC_777_PREFIX)) {
        const contentStart = i + OSC_777_PREFIX.length;
        const { endIndex, terminatorLen } = findOscEnd(text, contentStart);
        if (endIndex === -1) {
          filteredOutput += text.slice(i);
          break;
        }
        const content = text.slice(contentStart, endIndex);
        const notif = parseOsc777(content);
        if (notif) {
          notifications.push(notif);
        }
        // Always strip the sequence even if not a recognized subcommand
        i = endIndex + terminatorLen;
        continue;
      }

      // OSC 99
      if (remaining.startsWith(OSC_99_PREFIX)) {
        const contentStart = i + OSC_99_PREFIX.length;
        const { endIndex, terminatorLen } = findOscEnd(text, contentStart);
        if (endIndex === -1) {
          filteredOutput += text.slice(i);
          break;
        }
        const content = text.slice(contentStart, endIndex);
        notifications.push(parseOsc99(content));
        i = endIndex + terminatorLen;
        continue;
      }
    }

    filteredOutput += text[i];
    i++;
  }

  return { filteredOutput, notifications };
}
