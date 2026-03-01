/**
 * ModalController
 *
 * Reusable modal management abstraction.
 * Handles show/hide, backdrop clicks, and escape key.
 */

export interface ModalControllerOptions {
  /** The modal element */
  modal: HTMLElement;
  /** Optional close button */
  closeBtn?: HTMLElement | null;
  /** Callback when modal is shown */
  onShow?: () => void;
  /** Callback when modal is hidden */
  onHide?: () => void;
  /** Enable backdrop click to close (default: true) */
  backdropClose?: boolean;
  /** Enable escape key to close (default: true) */
  escapeClose?: boolean;
}

export interface ModalController {
  /** Show the modal */
  show(): void;
  /** Hide the modal */
  hide(): void;
  /** Check if modal is visible */
  isVisible(): boolean;
  /** Toggle modal visibility */
  toggle(show?: boolean): void;
  /** Cleanup event listeners */
  destroy(): void;
}

/**
 * Create a new ModalController instance
 */
export function createModalController(options: ModalControllerOptions): ModalController {
  const { modal, closeBtn, onShow, onHide, backdropClose = true, escapeClose = true } = options;

  // Event handler references for cleanup
  const handlers: Array<{ element: EventTarget; type: string; handler: EventListener }> = [];

  const addHandler = (element: EventTarget, type: string, handler: EventListener) => {
    element.addEventListener(type, handler);
    handlers.push({ element, type, handler });
  };

  const isVisible = (): boolean => {
    return !modal.classList.contains('hidden');
  };

  const show = (): void => {
    modal.classList.remove('hidden');
    onShow?.();
  };

  const hide = (): void => {
    modal.classList.add('hidden');
    onHide?.();
  };

  const toggle = (forceShow?: boolean): void => {
    if (forceShow !== undefined) {
      forceShow ? show() : hide();
    } else {
      isVisible() ? hide() : show();
    }
  };

  const destroy = (): void => {
    for (const { element, type, handler } of handlers) {
      element.removeEventListener(type, handler);
    }
    handlers.length = 0;
  };

  // Setup close button
  if (closeBtn) {
    addHandler(closeBtn, 'click', (e) => {
      e.preventDefault();
      hide();
    });
  }

  // Setup backdrop click
  if (backdropClose) {
    addHandler(modal, 'click', (e) => {
      if (e.target === modal) {
        hide();
      }
    });
  }

  // Setup escape key
  if (escapeClose) {
    addHandler(document, 'keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape' && isVisible()) {
        e.preventDefault();
        hide();
      }
    });
  }

  return {
    show,
    hide,
    isVisible,
    toggle,
    destroy
  };
}
