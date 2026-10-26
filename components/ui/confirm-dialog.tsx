"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CircleAlert, Trash2, X } from "lucide-react";

type ConfirmDialogTone = "warning" | "danger";

type ConfirmDialogOptions = {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
};

type PendingConfirmation = ConfirmDialogOptions & {
  resolve: (confirmed: boolean) => void;
};

function ConfirmDialog({
  options,
  onClose,
}: {
  options: ConfirmDialogOptions;
  onClose: (confirmed: boolean) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const tone = options.tone ?? "warning";

  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose(false);
      return;
    }

    if (event.key !== "Tab") return;

    const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );

    if (!focusableElements?.length) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  return createPortal(
    <div
      className="confirm-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose(false);
      }}
    >
      <div
        ref={dialogRef}
        className={`confirm-dialog confirm-dialog-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <button
          className="confirm-dialog-close"
          type="button"
          onClick={() => onClose(false)}
          aria-label="Fechar confirmação"
          title="Fechar"
        >
          <X size={18} />
        </button>

        <div className="confirm-dialog-content">
          <span className="confirm-dialog-icon" aria-hidden="true">
            {tone === "danger" ? <Trash2 size={24} /> : <CircleAlert size={24} />}
          </span>

          <div className="confirm-dialog-copy">
            <span className="confirm-dialog-eyebrow">
              {tone === "danger" ? "Ação permanente" : "Confirme a alteração"}
            </span>
            <h2 id={titleId}>{options.title}</h2>
            <div id={descriptionId} className="confirm-dialog-description">
              {options.description}
            </div>
          </div>
        </div>

        <div className="confirm-dialog-actions">
          <button
            ref={cancelButtonRef}
            className="button button-secondary"
            type="button"
            onClick={() => onClose(false)}
          >
            {options.cancelLabel ?? "Cancelar"}
          </button>
          <button
            className={`button confirm-dialog-confirm confirm-dialog-confirm-${tone}`}
            type="button"
            onClick={() => onClose(true)}
          >
            {options.confirmLabel ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function useConfirmDialog() {
  const [request, setRequest] = useState<PendingConfirmation | null>(null);
  const activeRequestRef = useRef<PendingConfirmation | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      activeRequestRef.current?.resolve(false);
      previousFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

      const nextRequest = { ...options, resolve };
      activeRequestRef.current = nextRequest;
      setRequest(nextRequest);
    });
  }, []);

  const close = useCallback((confirmed: boolean) => {
    const activeRequest = activeRequestRef.current;
    if (!activeRequest) return;

    activeRequestRef.current = null;
    setRequest(null);
    activeRequest.resolve(confirmed);

    window.requestAnimationFrame(() => previousFocusRef.current?.focus());
  }, []);

  useEffect(() => {
    return () => {
      activeRequestRef.current?.resolve(false);
      activeRequestRef.current = null;
    };
  }, []);

  return {
    confirm,
    confirmDialog: request ? <ConfirmDialog options={request} onClose={close} /> : null,
  };
}
