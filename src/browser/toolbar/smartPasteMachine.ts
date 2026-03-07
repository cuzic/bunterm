/**
 * SmartPaste State Machine
 *
 * XState machine for managing smart clipboard paste operations.
 * Handles states: idle, detecting, processing, previewing, uploading
 */

import { assign, setup } from 'xstate';

/**
 * Pending upload item
 */
export interface PendingUpload {
  blob: Blob;
  dataUrl: string;
  name: string;
  mimeType: string;
}

/**
 * State machine context
 */
export interface SmartPasteContext {
  pendingUploads: PendingUpload[];
  currentIndex: number;
  error: string | null;
  uploadedPaths: string[];
}

/**
 * State machine events
 */
export type SmartPasteEvent =
  | { type: 'PASTE_REQUEST' }
  | { type: 'DROP_FILES' }
  | { type: 'IMAGE_FOUND'; uploads: PendingUpload[] }
  | { type: 'TEXT_FOUND'; text: string }
  | { type: 'FILES_READY'; uploads: PendingUpload[] }
  | { type: 'ERROR'; error: string }
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'GOTO'; index: number }
  | { type: 'REMOVE' }
  | { type: 'CANCEL' }
  | { type: 'SUBMIT' }
  | { type: 'UPLOAD_SUCCESS'; paths: string[] }
  | { type: 'UPLOAD_ERROR'; error: string };

/**
 * Initial context
 */
const initialContext: SmartPasteContext = {
  pendingUploads: [],
  currentIndex: 0,
  error: null,
  uploadedPaths: []
};

/**
 * SmartPaste state machine
 */
export const smartPasteMachine = setup({
  types: {
    context: {} as SmartPasteContext,
    events: {} as SmartPasteEvent
  },
  actions: {
    setUploads: assign({
      pendingUploads: (_, params: { uploads: PendingUpload[] }) => params.uploads,
      currentIndex: () => 0,
      error: () => null
    }),
    setError: assign({
      error: (_, params: { error: string }) => params.error
    }),
    clearUploads: assign({
      pendingUploads: () => [],
      currentIndex: () => 0,
      error: () => null
    }),
    nextIndex: assign({
      currentIndex: ({ context }) => {
        const len = context.pendingUploads.length;
        return len > 0 ? (context.currentIndex + 1) % len : 0;
      }
    }),
    prevIndex: assign({
      currentIndex: ({ context }) => {
        const len = context.pendingUploads.length;
        return len > 0 ? (context.currentIndex - 1 + len) % len : 0;
      }
    }),
    gotoIndex: assign({
      currentIndex: (_, params: { index: number }) => params.index
    }),
    removeCurrentItem: assign({
      pendingUploads: ({ context }) => {
        const uploads = [...context.pendingUploads];
        uploads.splice(context.currentIndex, 1);
        return uploads;
      },
      currentIndex: ({ context }) => {
        const newLen = context.pendingUploads.length - 1;
        if (newLen <= 0) {
          return 0;
        }
        return context.currentIndex >= newLen ? newLen - 1 : context.currentIndex;
      }
    }),
    setUploadedPaths: assign({
      uploadedPaths: (_, params: { paths: string[] }) => params.paths,
      pendingUploads: () => [],
      currentIndex: () => 0
    })
  },
  guards: {
    hasUploads: ({ context }) => context.pendingUploads.length > 0,
    hasMultipleUploads: ({ context }) => context.pendingUploads.length > 1
  }
}).createMachine({
  id: 'smartPaste',
  initial: 'idle',
  context: initialContext,
  states: {
    idle: {
      on: {
        PASTE_REQUEST: {
          target: 'detecting',
          actions: assign({
            error: () => null,
            uploadedPaths: () => []
          })
        },
        DROP_FILES: {
          target: 'processing',
          actions: assign({
            error: () => null,
            uploadedPaths: () => []
          })
        }
      }
    },
    detecting: {
      on: {
        IMAGE_FOUND: {
          target: 'previewing',
          actions: {
            type: 'setUploads',
            params: ({ event }) => ({ uploads: event.uploads })
          }
        },
        TEXT_FOUND: { target: 'idle' },
        ERROR: {
          target: 'idle',
          actions: {
            type: 'setError',
            params: ({ event }) => ({ error: event.error })
          }
        }
      }
    },
    processing: {
      on: {
        FILES_READY: {
          target: 'previewing',
          actions: {
            type: 'setUploads',
            params: ({ event }) => ({ uploads: event.uploads })
          }
        },
        ERROR: {
          target: 'idle',
          actions: {
            type: 'setError',
            params: ({ event }) => ({ error: event.error })
          }
        }
      }
    },
    previewing: {
      on: {
        NEXT: {
          actions: 'nextIndex'
        },
        PREV: {
          actions: 'prevIndex'
        },
        GOTO: {
          actions: {
            type: 'gotoIndex',
            params: ({ event }) => ({ index: event.index })
          }
        },
        REMOVE: [
          {
            guard: 'hasMultipleUploads',
            actions: 'removeCurrentItem'
          },
          {
            target: 'idle',
            actions: 'clearUploads'
          }
        ],
        CANCEL: {
          target: 'idle',
          actions: 'clearUploads'
        },
        SUBMIT: {
          target: 'uploading'
        }
      }
    },
    uploading: {
      on: {
        UPLOAD_SUCCESS: {
          target: 'idle',
          actions: {
            type: 'setUploadedPaths',
            params: ({ event }) => ({ paths: event.paths })
          }
        },
        UPLOAD_ERROR: {
          target: 'previewing',
          actions: {
            type: 'setError',
            params: ({ event }) => ({ error: event.error })
          }
        }
      }
    }
  }
});
