/**
 * File Transfer API Tests (TDD)
 *
 * Tests for file upload/download HTTP endpoints.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  handleFileDownload,
  handleFileList,
  handleFileUpload,
  parseMultipartFile
} from './file-transfer-api.js';
import { DEFAULT_FILE_TRANSFER_CONFIG, createFileTransferManager } from './file-transfer.js';

// Test directory setup
let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `bunterm-api-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// Mock response helper
function createMockResponse(): ServerResponse & {
  statusCode: number;
  headers: Record<string, string>;
  body: Buffer | string;
} {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '' as Buffer | string,
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      if (headers) {
        Object.assign(this.headers, headers);
      }
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    end(data?: Buffer | string) {
      if (data) {
        this.body = data;
      }
      return this;
    }
  } as ServerResponse & {
    statusCode: number;
    headers: Record<string, string>;
    body: Buffer | string;
  };
  return res;
}

// =============================================================================
// Download API tests
// =============================================================================

describe('handleFileDownload', () => {
  test('returns file content with correct headers', async () => {
    writeFileSync(join(testDir, 'test.txt'), 'Hello, World!');
    const manager = createFileTransferManager({ baseDir: testDir });
    const res = createMockResponse();

    await handleFileDownload(manager, 'test.txt', res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/plain');
    // Content-Disposition uses RFC 5987 encoding for security
    expect(res.headers['Content-Disposition']).toContain('attachment; filename="test.txt"');
    expect(res.body.toString()).toBe('Hello, World!');
  });

  test('returns 404 for non-existent file', async () => {
    const manager = createFileTransferManager({ baseDir: testDir });
    const res = createMockResponse();

    await handleFileDownload(manager, 'nonexistent.txt', res);

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body.toString());
    expect(body.error).toBe('File not found');
  });

  test('returns 400 for path traversal attempt', async () => {
    const manager = createFileTransferManager({ baseDir: testDir });
    const res = createMockResponse();

    await handleFileDownload(manager, '../../../etc/passwd', res);

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body.toString());
    expect(body.error).toBe('Invalid file path');
  });

  test('returns 413 for file too large', async () => {
    writeFileSync(join(testDir, 'large.bin'), Buffer.alloc(2 * 1024));
    const manager = createFileTransferManager({
      baseDir: testDir,
      config: { ...DEFAULT_FILE_TRANSFER_CONFIG, max_file_size: 1024 }
    });
    const res = createMockResponse();

    await handleFileDownload(manager, 'large.bin', res);

    expect(res.statusCode).toBe(413);
    const body = JSON.parse(res.body.toString());
    expect(body.error).toBe('File too large');
  });

  test('returns 403 when transfer is disabled', async () => {
    const manager = createFileTransferManager({
      baseDir: testDir,
      config: { ...DEFAULT_FILE_TRANSFER_CONFIG, enabled: false }
    });
    const res = createMockResponse();

    await handleFileDownload(manager, 'test.txt', res);

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body.toString());
    expect(body.error).toBe('File transfer is disabled');
  });
});

// =============================================================================
// Upload API tests
// =============================================================================

describe('handleFileUpload', () => {
  test('saves file and returns success', async () => {
    const manager = createFileTransferManager({ baseDir: testDir });
    const res = createMockResponse();
    const content = Buffer.from('Uploaded content');

    await handleFileUpload(manager, 'uploaded.txt', content, res);

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body.toString());
    expect(body.success).toBe(true);
    expect(body.path).toBe('uploaded.txt');

    // Verify file was created
    const saved = await Bun.file(join(testDir, 'uploaded.txt')).text();
    expect(saved).toBe('Uploaded content');
  });

  test('returns 400 for path traversal attempt', async () => {
    const manager = createFileTransferManager({ baseDir: testDir });
    const res = createMockResponse();
    const content = Buffer.from('Malicious');

    await handleFileUpload(manager, '../../../etc/malicious', content, res);

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body.toString());
    expect(body.error).toBe('Invalid file path');
  });

  test('returns 413 for file too large', async () => {
    const manager = createFileTransferManager({
      baseDir: testDir,
      config: { ...DEFAULT_FILE_TRANSFER_CONFIG, max_file_size: 1024 }
    });
    const res = createMockResponse();
    const content = Buffer.alloc(2 * 1024);

    await handleFileUpload(manager, 'large.bin', content, res);

    expect(res.statusCode).toBe(413);
    const body = JSON.parse(res.body.toString());
    expect(body.error).toBe('File too large');
  });

  test('returns 403 for disallowed extension', async () => {
    const manager = createFileTransferManager({
      baseDir: testDir,
      config: { ...DEFAULT_FILE_TRANSFER_CONFIG, allowed_extensions: ['.txt'] }
    });
    const res = createMockResponse();
    const content = Buffer.from('content');

    await handleFileUpload(manager, 'file.exe', content, res);

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body.toString());
    expect(body.error).toBe('File extension not allowed');
  });
});

// =============================================================================
// List API tests
// =============================================================================

describe('handleFileList', () => {
  test('returns list of files', async () => {
    writeFileSync(join(testDir, 'file1.txt'), 'content1');
    writeFileSync(join(testDir, 'file2.log'), 'content2');
    const manager = createFileTransferManager({ baseDir: testDir });
    const res = createMockResponse();

    await handleFileList(manager, '.', res);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body.toString());
    expect(body.files.length).toBe(2);
    expect(body.files.map((f: { name: string }) => f.name).sort()).toEqual([
      'file1.txt',
      'file2.log'
    ]);
  });

  test('returns 404 for non-existent directory', async () => {
    const manager = createFileTransferManager({ baseDir: testDir });
    const res = createMockResponse();

    await handleFileList(manager, 'nonexistent', res);

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body.toString());
    expect(body.error).toBe('Directory not found');
  });
});

// =============================================================================
// Multipart parsing tests
// =============================================================================

describe('parseMultipartFile', () => {
  test('parses simple multipart body', () => {
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const content = 'file content here';
    const body = Buffer.from(
      `------WebKitFormBoundary7MA4YWxkTrZu0gW\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\n${content}\r\n------WebKitFormBoundary7MA4YWxkTrZu0gW--\r\n`
    );

    const result = parseMultipartFile(body, boundary);

    expect(result).not.toBeNull();
    expect(result?.filename).toBe('test.txt');
    expect(result?.content.toString()).toBe(content);
  });

  test('returns null for invalid multipart body', () => {
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const body = Buffer.from('invalid body');

    const result = parseMultipartFile(body, boundary);

    expect(result).toBeNull();
  });

  test('handles binary content', () => {
    const boundary = '----Boundary';
    const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
    const body = Buffer.concat([
      Buffer.from(
        '------Boundary\r\n' +
          `Content-Disposition: form-data; name="file"; filename="binary.bin"\r\n` +
          'Content-Type: application/octet-stream\r\n' +
          '\r\n'
      ),
      binaryContent,
      Buffer.from('\r\n------Boundary--\r\n')
    ]);

    const result = parseMultipartFile(body, boundary);

    expect(result).not.toBeNull();
    expect(result?.filename).toBe('binary.bin');
    expect(Buffer.compare(result?.content ?? Buffer.alloc(0), binaryContent)).toBe(0);
  });
});
