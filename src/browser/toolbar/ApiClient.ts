/**
 * ToolbarApiClient
 *
 * Centralized HTTP client for toolbar API calls.
 * Provides unified error handling and request management.
 */

/**
 * Image data for clipboard upload
 */
export interface ImageData {
  data: string;
  mimeType: string;
  name: string;
}

/**
 * File information
 */
export interface FileInfo {
  name: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
}

/**
 * Share link information
 */
export interface ShareLink {
  token: string;
  sessionName: string;
  expiresAt: string;
}

/**
 * Push notification subscription data
 */
export interface SubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  sessionName?: string;
}

/**
 * API error with status code
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 0
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * ApiClient configuration
 */
export interface ApiClientConfig {
  basePath: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

/**
 * ToolbarApiClient interface
 */
export interface ToolbarApiClient {
  // Clipboard
  uploadImages(session: string, images: ImageData[]): Promise<string[]>;

  // File Transfer
  listFiles(session: string, path: string): Promise<FileInfo[]>;
  downloadFile(session: string, path: string): Promise<Blob>;
  uploadFile(session: string, path: string, file: File): Promise<string>;

  // Notifications
  getVapidKey(): Promise<string>;
  subscribe(subscription: SubscriptionData): Promise<string>;
  unsubscribe(id: string): Promise<void>;

  // Share
  createShare(session: string, expiresIn: string): Promise<ShareLink>;
}

/**
 * Create a new ToolbarApiClient instance
 */
export function createApiClient(config: ApiClientConfig): ToolbarApiClient {
  const { basePath, fetch: customFetch, signal } = config;
  const fetchFn = customFetch ?? globalThis.fetch;

  /**
   * Make an API request with error handling
   */
  const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
    try {
      const response = await fetchFn(url, {
        ...init,
        signal: init?.signal ?? signal
      });

      if (!response.ok) {
        let message = `Request failed with status ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            message = errorData.error;
          }
        } catch {
          // Ignore JSON parse error
        }
        throw new ApiError(message, response.status);
      }

      return response as T;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0);
    }
  };

  /**
   * Make a JSON API request
   */
  const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const response = await request<Response>(url, init);
    return response.json() as Promise<T>;
  };

  // Clipboard
  const uploadImages = async (session: string, images: ImageData[]): Promise<string[]> => {
    const url = `${basePath}/api/clipboard-image?session=${encodeURIComponent(session)}`;
    const result = await requestJson<{ success: boolean; paths: string[]; error?: string }>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images })
    });
    return result.paths;
  };

  // File Transfer
  const listFiles = async (session: string, path: string): Promise<FileInfo[]> => {
    const url = `${basePath}/api/files/list?session=${encodeURIComponent(session)}&path=${encodeURIComponent(path)}`;
    const result = await requestJson<{ files: FileInfo[] }>(url);
    return result.files;
  };

  const downloadFile = async (session: string, path: string): Promise<Blob> => {
    const url = `${basePath}/api/files/download?session=${encodeURIComponent(session)}&path=${encodeURIComponent(path)}`;
    const response = await request<Response>(url);
    return response.blob();
  };

  const uploadFile = async (session: string, destPath: string, file: File): Promise<string> => {
    const url = `${basePath}/api/files/upload?session=${encodeURIComponent(session)}&path=${encodeURIComponent(destPath)}`;
    const formData = new FormData();
    formData.append('file', file);

    const result = await requestJson<{ success: boolean; path: string }>(url, {
      method: 'POST',
      body: formData
    });
    return result.path;
  };

  // Notifications
  const getVapidKey = async (): Promise<string> => {
    const url = `${basePath}/api/notifications/vapid-key`;
    const result = await requestJson<{ publicKey: string }>(url);
    return result.publicKey;
  };

  const subscribe = async (subscription: SubscriptionData): Promise<string> => {
    const url = `${basePath}/api/notifications/subscribe`;
    const result = await requestJson<{ id: string }>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });
    return result.id;
  };

  const unsubscribe = async (id: string): Promise<void> => {
    const url = `${basePath}/api/notifications/subscribe/${encodeURIComponent(id)}`;
    await request(url, { method: 'DELETE' });
  };

  // Share
  const createShare = (sessionName: string, expiresIn: string): Promise<ShareLink> => {
    const url = `${basePath}/api/shares`;
    return requestJson<ShareLink>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionName, expiresIn })
    });
  };

  return {
    uploadImages,
    listFiles,
    downloadFile,
    uploadFile,
    getVapidKey,
    subscribe,
    unsubscribe,
    createShare
  };
}
