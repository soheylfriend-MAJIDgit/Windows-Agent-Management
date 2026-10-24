"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { ApiRequestError, apiRequest, postJson, useApi } from "@/hooks/useApi";
import type { Overview, SyncResult } from "@/lib/types";

export interface SyncState {
  configured: boolean;
  auto: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

interface OverviewContextValue {
  data: Overview | null;
  error: ApiRequestError | null;
  loading: boolean;
  refreshing: boolean;
  reload: (opts?: { silent?: boolean }) => Promise<void>;
  refresh: () => Promise<void>;
  setData: Dispatch<SetStateAction<Overview | null>>;
  syncState: SyncState | null;
  syncError: ApiRequestError | null;
  reloadSync: (opts?: { silent?: boolean }) => Promise<void>;
  runSync: (opts?: { force?: boolean }) => Promise<SyncResult>;
}

const OverviewContext = createContext<OverviewContextValue | null>(null);

/** یک منبع مشترک برای وضعیت کلی و همگام‌سازی؛ همه‌ی صفحه‌ها از همین استفاده می‌کنند. */
export function OverviewProvider({ children }: { children: ReactNode }) {
  const overview = useApi<Overview>("/api/overview", { refreshMs: 60_000 });
  const sync = useApi<SyncState>("/api/sync", { refreshMs: 300_000 });

  const reload = overview.reload;
  const setData = overview.setData;
  const reloadSync = sync.reload;

  const refresh = useCallback(async () => {
    try {
      const fresh = await apiRequest<Overview>("/api/overview?refresh=1");
      setData(fresh);
    } catch {
      await reload({ silent: true });
    }
  }, [reload, setData]);

  const runSync = useCallback(
    async (opts: { force?: boolean } = {}) => {
      const result = await postJson<SyncResult>("/api/sync", opts);
      await Promise.all([reload({ silent: true }), reloadSync({ silent: true })]);
      return result;
    },
    [reload, reloadSync],
  );

  const busy = useRef(false);
  const lastAttempt = useRef(0);
  const state = sync.data;

  // همگام‌سازی خودکار فقط وقتی پنل باز است و درایو پیکربندی شده؛ حداکثر هر ۴ دقیقه.
  useEffect(() => {
    if (!state?.configured || !state.auto || busy.current) return;
    const now = Date.now();
    if (now - lastAttempt.current < 3 * 60_000) return;
    const last = state.lastSyncAt ? Date.parse(state.lastSyncAt) : 0;
    if (Number.isFinite(last) && last > 0 && now - last < 4 * 60_000) return;
    busy.current = true;
    lastAttempt.current = now;
    void (async () => {
      try {
        await runSync({});
      } catch {
        // همگام‌سازی خودکار نباید صفحه را به هم بریزد
      } finally {
        busy.current = false;
      }
    })();
  }, [state?.configured, state?.auto, state?.lastSyncAt, runSync]);

  const value = useMemo<OverviewContextValue>(
    () => ({
      data: overview.data,
      error: overview.error,
      loading: overview.loading,
      refreshing: overview.refreshing,
      reload,
      refresh,
      setData,
      syncState: sync.data,
      syncError: sync.error,
      reloadSync,
      runSync,
    }),
    [
      overview.data,
      overview.error,
      overview.loading,
      overview.refreshing,
      reload,
      refresh,
      setData,
      sync.data,
      sync.error,
      reloadSync,
      runSync,
    ],
  );

  return <OverviewContext.Provider value={value}>{children}</OverviewContext.Provider>;
}

export function useOverview(): OverviewContextValue {
  const ctx = useContext(OverviewContext);
  if (!ctx) throw new Error("useOverview must be used within OverviewProvider");
  return ctx;
}
