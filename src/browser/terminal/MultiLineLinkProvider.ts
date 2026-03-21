/**
 * Multi-Line Link Provider
 *
 * Detects URLs that span multiple lines due to explicit line breaks with indentation.
 * Example:
 *   See: https://example.com/path/to/
 *       resource?param=value
 *
 * Joins the URL parts and makes them clickable.
 */

import type { IBufferLine, ILink, ILinkProvider, Terminal } from '@xterm/xterm';

/** Characters that are valid in URLs */
const URL_CHAR_REGEX = /^[a-zA-Z0-9\-._~:/?#@!$&'()*+,;=%]+$/;

export class MultiLineLinkProvider implements ILinkProvider {
  constructor(
    private terminal: Terminal,
    private handler: (event: MouseEvent, uri: string) => void
  ) {}

  provideLinks(lineNumber: number, callback: (links: ILink[] | undefined) => void): void {
    try {
      const buffer = this.terminal.buffer.active;
      const line = buffer.getLine(lineNumber);

      if (!line) {
        callback(undefined);
        return;
      }

      const lineText = this.getLineText(line);
      const links: ILink[] = [];

      // Case 1: This line contains a URL start (http:// or https://)
      const urlMatches = [...lineText.matchAll(/https?:\/\/[^\s]*/g)];

      for (const match of urlMatches) {
        const urlStart = match[0];
        const startX = match.index!;

        // Build full URL including any continuations on following lines
        const fullUrl = this.buildUrlWithContinuations(urlStart, lineNumber, buffer);

        // Only provide link if URL spans multiple lines (WebLinksAddon handles single-line)
        if (fullUrl.endLine > lineNumber && this.isValidUrl(fullUrl.url)) {
          links.push({
            range: {
              start: { x: startX + 1, y: lineNumber + 1 },
              end: { x: fullUrl.endX + 1, y: fullUrl.endLine + 1 }
            },
            text: fullUrl.url,
            activate: (_event: MouseEvent) => {
              this.handler(_event, fullUrl.url);
            }
          });
        }
      }

      // Case 2: This line might be a continuation (starts with whitespace + URL-like chars)
      if (links.length === 0) {
        const continuation = this.findUrlFromContinuationLine(lineNumber, buffer);
        if (continuation) {
          links.push(continuation);
        }
      }

      callback(links.length > 0 ? links : undefined);
    } catch (err) {
      console.error('[MultiLineLink] Error:', err);
      callback(undefined);
    }
  }

  /**
   * Build URL including continuations on following lines
   */
  private buildUrlWithContinuations(
    initialUrl: string,
    startLine: number,
    buffer: typeof this.terminal.buffer.active
  ): { url: string; endLine: number; endX: number } {
    let url = initialUrl;
    let endLine = startLine;
    const startLineText = this.getLineText(buffer.getLine(startLine)!);
    let endX = startLineText.indexOf(initialUrl) + initialUrl.length;

    // Look for continuations on following lines
    let nextLineNum = startLine + 1;
    const maxLines = Math.min(startLine + 10, buffer.length);

    while (nextLineNum < maxLines) {
      const nextLine = buffer.getLine(nextLineNum);
      if (!nextLine) break;

      const nextLineText = this.getLineText(nextLine);
      const trimmed = nextLineText.trimStart();

      // Empty line = end of URL
      if (!trimmed) break;

      // Get the first token (non-whitespace sequence)
      const tokenMatch = /^[^\s]+/.exec(trimmed);
      if (!tokenMatch) break;

      const token = tokenMatch[0];

      // Check if token looks like URL continuation
      if (!URL_CHAR_REGEX.test(token)) break;

      // Add to URL
      url += token;
      endLine = nextLineNum;
      endX = nextLineText.indexOf(trimmed) + token.length;

      // If there's more content on this line after the token, URL ends here
      if (trimmed.length > token.length) break;

      nextLineNum++;
    }

    return { url: this.cleanUrl(url), endLine, endX };
  }

  /**
   * When on a continuation line, find the URL start on previous lines
   */
  private findUrlFromContinuationLine(
    lineNumber: number,
    buffer: typeof this.terminal.buffer.active
  ): ILink | null {
    const line = buffer.getLine(lineNumber);
    if (!line) return null;

    const lineText = this.getLineText(line);
    const trimmed = lineText.trimStart();

    // Must have leading whitespace and start with URL-like characters
    if (!trimmed || lineText === trimmed) return null;
    if (!URL_CHAR_REGEX.test(trimmed.charAt(0))) return null;

    // Get the token on this line
    const tokenMatch = /^[^\s]+/.exec(trimmed);
    if (!tokenMatch) return null;

    const token = tokenMatch[0];
    if (!URL_CHAR_REGEX.test(token)) return null;

    // Search backward for a line containing URL start
    let searchLine = lineNumber - 1;
    const minLine = Math.max(0, lineNumber - 10);

    while (searchLine >= minLine) {
      const prevLine = buffer.getLine(searchLine);
      if (!prevLine) break;

      const prevText = this.getLineText(prevLine);

      // Look for URL pattern in this line
      const urlMatches = [...prevText.matchAll(/https?:\/\/[^\s]*/g)];
      const lastMatch = urlMatches[urlMatches.length - 1];

      if (lastMatch) {
        const urlStartX = lastMatch.index!;
        const urlStartText = lastMatch[0];

        // Build the full URL from this point
        const fullUrl = this.buildUrlWithContinuations(urlStartText, searchLine, buffer);

        // Check if this URL includes our current line
        if (fullUrl.endLine >= lineNumber && this.isValidUrl(fullUrl.url)) {
          const leadingSpaces = lineText.length - trimmed.length;

          return {
            range: {
              start: { x: urlStartX + 1, y: searchLine + 1 },
              end: { x: leadingSpaces + token.length + 1, y: lineNumber + 1 }
            },
            text: fullUrl.url,
            activate: (_event: MouseEvent) => {
              this.handler(_event, fullUrl.url);
            }
          };
        }
      }

      searchLine--;
    }

    return null;
  }

  /**
   * Get text content from a buffer line
   */
  private getLineText(line: IBufferLine): string {
    let text = '';
    for (let i = 0; i < line.length; i++) {
      const cell = line.getCell(i);
      if (cell) {
        text += cell.getChars() || ' ';
      }
    }
    return text.trimEnd();
  }

  /**
   * Clean up URL by removing trailing punctuation
   */
  private cleanUrl(url: string): string {
    return url.replace(/[.,;:!?)>\]}"']+$/, '');
  }

  /**
   * Validate that a string is a valid URL
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Register multi-line link provider with a terminal
 */
export function registerMultiLineLinkProvider(
  terminal: Terminal,
  handler?: (event: MouseEvent, uri: string) => void
): void {
  const defaultHandler = (_event: MouseEvent, uri: string) => {
    // Use a temporary anchor element to open the link
    // This works better on mobile where window.open might be blocked
    const a = document.createElement('a');
    a.href = uri;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  terminal.registerLinkProvider(new MultiLineLinkProvider(terminal, handler ?? defaultHandler));
}
