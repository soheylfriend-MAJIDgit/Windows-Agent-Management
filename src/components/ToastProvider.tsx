"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons";

type Tone = "ok" | "error" | "warn" | "info";

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

interface ToastApi {
  push: (message: string, tone?: Tone) => void;
  ok: (message: string) => void;
  error: (message: string) => void;
  warn: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(1);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: Tone = "info") => {
      const id = idRef.current++;
      setItems((prev) => [...prev.slice(-3), { id, message, tone }]);
      setTimeout(() => remove(id), 4800);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      ok: (message: string) => push(message, "ok"),
      error: (message: string) => push(message, "error"),
      warn: (message: string) => push(message, "warn"),
    }),
    [push],
  );

  const icons = {
    ok: "check-circle",
    error: "x-circle",
    warn: "alert",
    info: "info",
  } as const;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast is-${item.tone}`}>
            <span className="toast-icon">
              <Icon name={icons[item.tone]} size={17} />
            </span>
            <span className="grow">{item.message}</span>
            <button type="button" className="toast-close" onClick={() => remove(item.id)} aria-label="بستن پیام">
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
