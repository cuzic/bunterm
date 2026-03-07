/**
 * PWA (Progressive Web App) support for bunterm
 *
 * Provides:
 * - Web App Manifest for "Add to Home Screen" functionality
 * - Service Worker for installability
 * - App icons (SVG with PNG fallbacks)
 */

import { deflateSync as zlibDeflateSync } from 'node:zlib';

/**
 * Generate Web App Manifest JSON
 */
export function generateManifest(basePath: string): object {
  return {
    name: 'bunterm',
    short_name: 'bunterm',
    description: 'Terminal session manager',
    start_url: `${basePath}/`,
    display: 'fullscreen',
    orientation: 'any',
    background_color: '#1a1a2e',
    theme_color: '#00d9ff',
    icons: [
      {
        src: `${basePath}/icon.svg`,
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any'
      },
      {
        src: `${basePath}/icon-192.png`,
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: `${basePath}/icon-512.png`,
        sizes: '512x512',
        type: 'image/png'
      }
    ]
  };
}

/**
 * Service Worker script
 *
 * Minimal implementation for PWA installability.
 * Uses network-first strategy since terminal requires online connectivity.
 * Also handles push notifications.
 */
export const serviceWorkerScript = `// bunterm Service Worker
self.addEventListener('install', (event) => {
  // Skip waiting to activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim all clients immediately
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network-first strategy - terminal requires online connectivity
  event.respondWith(fetch(event.request));
});

// Push notification handler
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'Terminal notification',
      icon: '/bunterm/icon-192.png',
      badge: '/bunterm/icon-192.png',
      tag: data.tag || 'bunterm-notification',
      requireInteraction: true,
      data: {
        sessionName: data.sessionName,
        timestamp: data.timestamp,
        url: data.sessionName ? '/bunterm/' + data.sessionName : '/bunterm/'
      }
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'bunterm', options)
    );
  } catch (e) {
    console.error('[SW] Push notification error:', e);
  }
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/bunterm/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Try to focus existing window
        for (const client of clientList) {
          if (client.url.includes('/bunterm/') && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if none exists
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
`;

/**
 * SVG icon for bunterm
 *
 * Simple terminal prompt icon (>_) with the app's color scheme.
 */
export const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="64" fill="#1a1a2e"/>
  <text x="256" y="320" font-family="monospace" font-size="200" font-weight="bold" fill="#00d9ff" text-anchor="middle">&gt;_</text>
</svg>`;

/**
 * Generate PNG icon from SVG using canvas
 *
 * Note: This is a simplified approach. For production, consider pre-generating
 * PNG files or using a proper SVG-to-PNG library.
 *
 * The PNG data below is a pre-rendered version of the SVG icon.
 */

// 192x192 PNG icon (base64 encoded)
// Simple terminal icon with >_ symbol
export const icon192Base64 = generateIconPngBase64(192);

// 512x512 PNG icon (base64 encoded)
export const icon512Base64 = generateIconPngBase64(512);

/**
 * Generate a simple PNG icon as base64
 *
 * Creates a minimal valid PNG with the terminal icon appearance.
 * Uses a simple solid color placeholder that matches the theme.
 */
function generateIconPngBase64(size: number): string {
  // Create PNG using minimal valid PNG structure
  // This creates a simple colored square as a fallback
  // Real icons should be pre-generated for better quality

  const png = createMinimalPng(size, size, [0x1a, 0x1a, 0x2e]); // #1a1a2e background
  return Buffer.from(png).toString('base64');
}

/**
 * Create minimal valid PNG data
 */
function createMinimalPng(
  width: number,
  height: number,
  rgb: [number, number, number]
): Uint8Array {
  // PNG signature
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  // IHDR chunk
  const ihdr = createIhdrChunk(width, height);

  // IDAT chunk (image data)
  const idat = createIdatChunk(width, height, rgb);

  // IEND chunk
  const iend = createIendChunk();

  // Combine all parts
  const totalLength = signature.length + ihdr.length + idat.length + iend.length;
  const png = new Uint8Array(totalLength);

  let offset = 0;
  png.set(signature, offset);
  offset += signature.length;
  png.set(ihdr, offset);
  offset += ihdr.length;
  png.set(idat, offset);
  offset += idat.length;
  png.set(iend, offset);

  return png;
}

function createIhdrChunk(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);

  view.setUint32(0, width, false); // width
  view.setUint32(4, height, false); // height
  data[8] = 8; // bit depth
  data[9] = 2; // color type (RGB)
  data[10] = 0; // compression
  data[11] = 0; // filter
  data[12] = 0; // interlace

  return createChunk('IHDR', data);
}

function createIdatChunk(width: number, height: number, rgb: [number, number, number]): Uint8Array {
  // Create uncompressed image data
  // Each row: filter byte (0) + RGB pixels
  const rowSize = 1 + width * 3;
  const rawData = new Uint8Array(height * rowSize);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // No filter

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 3;
      rawData[pixelOffset] = rgb[0];
      rawData[pixelOffset + 1] = rgb[1];
      rawData[pixelOffset + 2] = rgb[2];
    }
  }

  // Compress with zlib (deflate)
  const compressed = deflateSync(rawData);

  return createChunk('IDAT', compressed);
}

function createIendChunk(): Uint8Array {
  return createChunk('IEND', new Uint8Array(0));
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);

  // Length
  view.setUint32(0, data.length, false);

  // Type
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i);
  }

  // Data
  chunk.set(data, 8);

  // CRC (of type + data)
  const crcData = new Uint8Array(4 + data.length);
  crcData.set(chunk.subarray(4, 8), 0);
  crcData.set(data, 4);
  const crc = crc32(crcData);
  view.setUint32(8 + data.length, crc, false);

  return chunk;
}

/**
 * Simple deflate compression (zlib format)
 */
function deflateSync(data: Uint8Array): Uint8Array {
  return zlibDeflateSync(Buffer.from(data));
}

/**
 * CRC32 calculation for PNG chunks
 */
function crc32(data: Uint8Array): number {
  // CRC32 lookup table
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }

  let crc = 0xffffffff;
  for (const byte of data) {
    const index = (crc ^ byte) & 0xff;
    crc = (table[index] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Get PNG icon as Buffer
 */
export function getIconPng(size: 192 | 512): Buffer {
  const base64 = size === 192 ? icon192Base64 : icon512Base64;
  return Buffer.from(base64, 'base64');
}

/**
 * Get SVG icon as string
 */
export function getIconSvg(): string {
  return iconSvg;
}

/**
 * Get Service Worker script
 */
export function getServiceWorker(): string {
  return serviceWorkerScript;
}

/**
 * Get manifest JSON string
 */
export function getManifestJson(basePath: string): string {
  return JSON.stringify(generateManifest(basePath), null, 2);
}
