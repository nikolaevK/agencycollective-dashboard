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
import { Button } from "@/components/ui/button";

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
                  "flex items-start gap-2.5 rounded-2xl bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5 animate-in fade-in-0 slide-in-from-bottom-2 dark:ring-foreground/10",
                  t.variant === "error"
                    ? "[&>svg]:text-destructive"
                    : "[&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400"
                )}
              >
                {t.variant === "error" ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span className="flex-1 text-foreground">{t.message}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => dismiss(t.id)}
                  className="-my-0.5 -mr-1 text-muted-foreground"
                  aria-label="Dismiss"
                >
                  <X />
                </Button>
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
