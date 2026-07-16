"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Minimal dependency-free toast stack. Mounted once at the root layout so
 * every surface (dashboard, portals) can surface mutation errors without
 * blocking `alert()` calls or silent catches.
 */

type ToastVariant = "error" | "success";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastApi {
  toast: (message: string, variant?: ToastVariant) => void;
  toastError: (message: string) => void;
  toastSuccess: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 5_000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "error") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const api: ToastApi = {
    toast,
    toastError: (m) => toast(m, "error"),
    toastSuccess: (m) => toast(m, "success"),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== "undefined" &&
        toasts.length > 0 &&
        createPortal(
          <div className="fixed bottom-4 left-1/2 z-[100] flex w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2 md:left-auto md:right-4 md:translate-x-0">
            {toasts.map((t) => (
              <div
                key={t.id}
                role="status"
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border bg-card px-3.5 py-3 text-sm shadow-lg animate-in fade-in-0 slide-in-from-bottom-2",
                  t.variant === "error"
                    ? "border-red-500/40 text-red-700 dark:text-red-400"
                    : "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                )}
              >
                {t.variant === "error" ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span className="flex-1 text-foreground">{t.message}</span>
                <button
                  onClick={() => dismiss(t.id)}
                  className="p-1 -m-1 text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

/** No-op fallback so components never crash if the provider is missing. */
const NOOP_API: ToastApi = {
  toast: () => {},
  toastError: () => {},
  toastSuccess: () => {},
};

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP_API;
}
