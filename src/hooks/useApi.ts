"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  hint?: string;
  details?: unknown;

  constructor(message: string, options: { status?: number; code?: string; hint?: string; details?: unknown } = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options.status ?? 0;
    this.code = options.code;
    this.hint = options.hint;
    this.details = options.details;
  }
}

export async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiRequestError("ارتباط با سرور برقرار نشد.", {
      status: 0,
      code: "network",
      hint: "اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
    });
  }

  if (!res.ok) {
    type ErrorBody = { error?: { message?: string; code?: string; hint?: string; details?: unknown } };
    let body: ErrorBody | null = null;
    try {
      body = (await res.json()) as ErrorBody;
    } catch {
      body = null;
    }
    throw new ApiRequestError(body?.error?.message ?? `درخواست ناموفق بود (کد ${res.status}).`, {
      status: res.status,
      code: body?.error?.code,
      hint: body?.error?.hint,
      details: body?.error?.details,
    });
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiRequestError("پاسخ سرور قابل خواندن نبود.", { status: 0, code: "bad_response" });
  }
}

export function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiRequest<T>(url, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function putJson<T>(url: string, body?: unknown): Promise<T> {
  return apiRequest<T>(url, {
    method: "PUT",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

interface UseApiOptions {
  refreshMs?: number;
  enabled?: boolean;
}

export function useApi<T>(url: string | null, options: UseApiOptions = {}) {
  const { refreshMs, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!url || !enabled) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (!opts.silent) setRefreshing(true);
      try {
        const result = await apiRequest<T>(url, { signal: controller.signal });
        if (!alive.current) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (!alive.current) return;
        if (err instanceof ApiRequestError) setError(err);
        else setError(new ApiRequestError("خطای نامشخص رخ داد."));
      } finally {
        if (alive.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [url, enabled],
  );

  useEffect(() => {
    alive.current = true;
    if (!url || !enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void load({ silent: true });
    let timer: ReturnType<typeof setInterval> | null = null;
    if (refreshMs && refreshMs > 0) {
      timer = setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        void load({ silent: true });
      }, refreshMs);
    }
    return () => {
      alive.current = false;
      abortRef.current?.abort();
      if (timer) clearInterval(timer);
    };
  }, [url, enabled, refreshMs, load]);

  return { data, error, loading, refreshing, reload: load, setData };
}

export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
