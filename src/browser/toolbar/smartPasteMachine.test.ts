/**
 * SmartPaste State Machine Tests (TDD)
 */

import { describe, expect, test } from 'bun:test';
import { createActor } from 'xstate';
import { type PendingUpload, smartPasteMachine } from './smartPasteMachine.js';

const createTestUpload = (name: string): PendingUpload => ({
  blob: new Blob(['test']),
  dataUrl: 'data:image/png;base64,test',
  name,
  mimeType: 'image/png'
});

describe('SmartPaste State Machine', () => {
  describe('initial state', () => {
    test('starts in idle state', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();

      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.pendingUploads).toEqual([]);
      expect(actor.getSnapshot().context.currentIndex).toBe(0);

      actor.stop();
    });
  });

  describe('paste request flow', () => {
    test('idle -> detecting on PASTE_REQUEST', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();

      actor.send({ type: 'PASTE_REQUEST' });

      expect(actor.getSnapshot().value).toBe('detecting');

      actor.stop();
    });

    test('detecting -> previewing on IMAGE_FOUND', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();
      actor.send({ type: 'PASTE_REQUEST' });

      const upload = createTestUpload('test.png');
      actor.send({ type: 'IMAGE_FOUND', uploads: [upload] });

      expect(actor.getSnapshot().value).toBe('previewing');
      expect(actor.getSnapshot().context.pendingUploads).toEqual([upload]);

      actor.stop();
    });

    test('detecting -> idle on TEXT_FOUND', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();
      actor.send({ type: 'PASTE_REQUEST' });

      actor.send({ type: 'TEXT_FOUND', text: 'hello' });

      expect(actor.getSnapshot().value).toBe('idle');

      actor.stop();
    });

    test('detecting -> idle on ERROR', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();
      actor.send({ type: 'PASTE_REQUEST' });

      actor.send({ type: 'ERROR', error: 'Clipboard access denied' });

      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.error).toBe('Clipboard access denied');

      actor.stop();
    });
  });

  describe('drop files flow', () => {
    test('idle -> processing on DROP_FILES', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();

      actor.send({ type: 'DROP_FILES' });

      expect(actor.getSnapshot().value).toBe('processing');

      actor.stop();
    });

    test('processing -> previewing on FILES_READY', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();
      actor.send({ type: 'DROP_FILES' });

      const uploads = [createTestUpload('file1.png'), createTestUpload('file2.png')];
      actor.send({ type: 'FILES_READY', uploads });

      expect(actor.getSnapshot().value).toBe('previewing');
      expect(actor.getSnapshot().context.pendingUploads).toEqual(uploads);

      actor.stop();
    });
  });

  describe('preview navigation', () => {
    test('NEXT increments currentIndex', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();
      actor.send({ type: 'PASTE_REQUEST' });

      const uploads = [createTestUpload('1.png'), createTestUpload('2.png')];
      actor.send({ type: 'IMAGE_FOUND', uploads });

      expect(actor.getSnapshot().context.currentIndex).toBe(0);

      actor.send({ type: 'NEXT' });

      expect(actor.getSnapshot().value).toBe('previewing');
      expect(actor.getSnapshot().context.currentIndex).toBe(1);

      actor.stop();
    });

    test('NEXT wraps around at end', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();
      actor.send({ type: 'PASTE_REQUEST' });

      const uploads = [createTestUpload('1.png'), createTestUpload('2.png')];
      actor.send({ type: 'IMAGE_FOUND', uploads });

      actor.send({ type: 'NEXT' });
      actor.send({ type: 'NEXT' });

      expect(actor.getSnapshot().context.currentIndex).toBe(0);

      actor.stop();
    });

    test('PREV decrements currentIndex', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();
      actor.send({ type: 'PASTE_REQUEST' });

      const uploads = [createTestUpload('1.png'), createTestUpload('2.png')];
      actor.send({ type: 'IMAGE_FOUND', uploads });

      actor.send({ type: 'NEXT' }); // Now at index 1
      actor.send({ type: 'PREV' }); // Back to index 0

      expect(actor.getSnapshot().context.currentIndex).toBe(0);

      actor.stop();
    });

    test('PREV wraps around at start', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();
      actor.send({ type: 'PASTE_REQUEST' });

      const uploads = [createTestUpload('1.png'), createTestUpload('2.png')];
      actor.send({ type: 'IMAGE_FOUND', uploads });

      actor.send({ type: 'PREV' }); // Should wrap to index 1

      expect(actor.getSnapshot().context.currentIndex).toBe(1);

      actor.stop();
    });

    test('GOTO sets specific index', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();
      actor.send({ type: 'PASTE_REQUEST' });

      const uploads = [
        createTestUpload('1.png'),
        createTestUpload('2.png'),
        createTestUpload('3.png')
      ];
      actor.send({ type: 'IMAGE_FOUND', uploads });

      actor.send({ type: 'GOTO', index: 2 });

      expect(actor.getSnapshot().context.currentIndex).toBe(2);

      actor.stop();
    });
  });

  describe('remove item', () => {
    test('REMOVE removes current item and adjusts index', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();
      actor.send({ type: 'PASTE_REQUEST' });

      const uploads = [createTestUpload('1.png'), createTestUpload('2.png')];
      actor.send({ type: 'IMAGE_FOUND', uploads });

      actor.send({ type: 'REMOVE' });

      expect(actor.getSnapshot().context.pendingUploads.length).toBe(1);
      expect(actor.getSnapshot().context.pendingUploads[0].name).toBe('2.png');

      actor.stop();
    });

    test('REMOVE returns to idle when last item removed', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();
      actor.send({ type: 'PASTE_REQUEST' });

      const uploads = [createTestUpload('1.png')];
      actor.send({ type: 'IMAGE_FOUND', uploads });

      actor.send({ type: 'REMOVE' });

      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.pendingUploads).toEqual([]);

      actor.stop();
    });

    test('REMOVE adjusts index when removing last item', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();
      actor.send({ type: 'PASTE_REQUEST' });

      const uploads = [createTestUpload('1.png'), createTestUpload('2.png')];
      actor.send({ type: 'IMAGE_FOUND', uploads });
      actor.send({ type: 'NEXT' }); // Now at index 1

      actor.send({ type: 'REMOVE' }); // Remove 2.png

      expect(actor.getSnapshot().context.pendingUploads.length).toBe(1);
      expect(actor.getSnapshot().context.currentIndex).toBe(0);

      actor.stop();
    });
  });

  describe('cancel', () => {
    test('CANCEL returns to idle and clears uploads', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();
      actor.send({ type: 'PASTE_REQUEST' });

      const uploads = [createTestUpload('1.png')];
      actor.send({ type: 'IMAGE_FOUND', uploads });

      actor.send({ type: 'CANCEL' });

      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.pendingUploads).toEqual([]);
      expect(actor.getSnapshot().context.currentIndex).toBe(0);

      actor.stop();
    });
  });

  describe('upload flow', () => {
    test('SUBMIT transitions to uploading', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();
      actor.send({ type: 'PASTE_REQUEST' });

      const uploads = [createTestUpload('1.png')];
      actor.send({ type: 'IMAGE_FOUND', uploads });

      actor.send({ type: 'SUBMIT' });

      expect(actor.getSnapshot().value).toBe('uploading');

      actor.stop();
    });

    test('UPLOAD_SUCCESS returns to idle with paths', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();
      actor.send({ type: 'PASTE_REQUEST' });

      const uploads = [createTestUpload('1.png')];
      actor.send({ type: 'IMAGE_FOUND', uploads });
      actor.send({ type: 'SUBMIT' });

      actor.send({ type: 'UPLOAD_SUCCESS', paths: ['/tmp/1.png'] });

      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.uploadedPaths).toEqual(['/tmp/1.png']);
      expect(actor.getSnapshot().context.pendingUploads).toEqual([]);

      actor.stop();
    });

    test('UPLOAD_ERROR returns to previewing with error', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();
      actor.send({ type: 'PASTE_REQUEST' });

      const uploads = [createTestUpload('1.png')];
      actor.send({ type: 'IMAGE_FOUND', uploads });
      actor.send({ type: 'SUBMIT' });

      actor.send({ type: 'UPLOAD_ERROR', error: 'Upload failed' });

      expect(actor.getSnapshot().value).toBe('previewing');
      expect(actor.getSnapshot().context.error).toBe('Upload failed');
      // Uploads should still be there for retry
      expect(actor.getSnapshot().context.pendingUploads.length).toBe(1);

      actor.stop();
    });
  });

  describe('guards', () => {
    test('cannot submit when no uploads', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();
      // Try to send SUBMIT from idle (should be ignored)
      actor.send({ type: 'SUBMIT' });

      expect(actor.getSnapshot().value).toBe('idle');

      actor.stop();
    });

    test('cannot navigate when not in previewing state', () => {
      const actor = createActor(smartPasteMachine);
      actor.start();

      actor.send({ type: 'NEXT' });
      actor.send({ type: 'PREV' });

      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.currentIndex).toBe(0);

      actor.stop();
    });
  });
});
