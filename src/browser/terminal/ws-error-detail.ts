/**
 * WebSocket Error Detail
 *
 * Utilities for fetching and formatting detailed error information when a
 * WebSocket connection is rejected. The browser WebSocket API's `onerror`
 * event does not expose the HTTP status code or response body, so we make
 * a follow-up HTTP GET request to the same URL to retrieve the rejection
 * reason from the response body.
 */

export interface WebSocketErrorDetail {
  /** HTTP status code from the server */
  status: number;
  /** Parsed reason code extracted from the response body (if any) */
  reason: string | undefined;
  /** User-facing hint message derived from the status and reason */
  hint: string;
}

/**
 * Convert a WebSocket URL to its HTTP equivalent for error-detail fetching.
 *
 * ws://  → http://
 * wss:// → https://
 *
 * @throws if the input URL does not start with ws:// or wss://
 */
export function buildHttpUrlFromWs(wsUrl: string): string {
  if (wsUrl.startsWith('wss://')) {
    return `https://${wsUrl.slice('wss://'.length)}`;
  }
  if (wsUrl.startsWith('ws://')) {
    return `http://${wsUrl.slice('ws://'.length)}`;
  }
  throw new Error(`Not a WebSocket URL: ${wsUrl}`);
}

/**
 * Parse a reason code from a server error response body.
 *
 * The server sends bodies like "Forbidden: origin_not_allowed".
 * This function extracts the part after the colon.
 */
function extractReasonFromBody(body: string): string | undefined {
  const match = /:\s*(\w+)\s*$/.exec(body.trim());
  return match ? match[1] : undefined;
}

/**
 * Build a user-facing hint based on HTTP status and parsed reason.
 */
function buildHint(status: number, reason: string | undefined): string {
  if (status === 403) {
    if (reason === 'origin_not_allowed') {
      return 'Origin が許可されていません。config.yaml の security.allowed_origins を確認してください。';
    }
    if (reason === 'missing_origin') {
      return 'Origin ヘッダーがありません。ブラウザから直接アクセスしてください。';
    }
    return '接続が拒否されました (403)。設定を確認してください。';
  }

  if (status === 401) {
    return '認証が必要です (401)。アクセストークンを確認してください。';
  }

  if (status === 404) {
    return 'セッションが見つかりません (404)。セッション名を確認してください。';
  }

  if (status >= 500) {
    return `サーバーエラーが発生しました (${status})。サーバーログを確認してください。`;
  }

  return `接続に失敗しました (${status})。設定を確認してください。`;
}

/**
 * Parse the HTTP status code and response body from a server error response
 * into a structured {@link WebSocketErrorDetail}.
 *
 * This is a pure function with no I/O — pass the status code and body text
 * that you already retrieved.
 */
export function parseWebSocketErrorBody(status: number, body: string): WebSocketErrorDetail {
  const reason = body ? extractReasonFromBody(body) : undefined;
  const hint = buildHint(status, reason);
  return { status, reason, hint };
}

/**
 * Format a {@link WebSocketErrorDetail} into a single user-facing error string
 * suitable for display in the terminal connection error element.
 *
 * The returned string always contains the HTTP status code and the hint text,
 * and never contains the literal string "undefined".
 */
export function formatWebSocketConnectionError(detail: WebSocketErrorDetail): string {
  return `接続エラー (HTTP ${detail.status}): ${detail.hint}`;
}

/**
 * Fetch error details for a failed WebSocket connection by making an HTTP GET
 * request to the same URL (converted from ws:// → http://).
 *
 * If the fetch itself fails (e.g. network offline, CORS), a generic error
 * detail is returned instead of throwing.
 *
 * @param wsUrl - The WebSocket URL that failed to connect
 * @returns A {@link WebSocketErrorDetail} describing the failure
 */
export async function fetchWebSocketErrorDetail(wsUrl: string): Promise<WebSocketErrorDetail> {
  let httpUrl: string;
  try {
    httpUrl = buildHttpUrlFromWs(wsUrl);
  } catch {
    return {
      status: 0,
      reason: undefined,
      hint: '接続に失敗しました。ネットワーク設定を確認してください。'
    };
  }

  try {
    const response = await fetch(httpUrl, {
      method: 'GET',
      // Use no-cors only as a last resort; we need to read the body
      credentials: 'same-origin'
    });

    const body = await response.text().catch(() => '');
    return parseWebSocketErrorBody(response.status, body);
  } catch {
    return {
      status: 0,
      reason: undefined,
      hint: '接続に失敗しました。サーバーが起動しているか確認してください。'
    };
  }
}
