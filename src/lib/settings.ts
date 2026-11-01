import {
  APP_VERSION,
  clearRepoConfigCache,
  getRepoConfig,
  getRepoDefaults,
  saveRepoConfig,
  validateRepoConfig,
  type RepoKind,
} from "./config";
import { envVar } from "./db";
import { driveStatus, getDriveState } from "./drive";
import { AppError } from "./errors";
import { invalidateArchiveCache } from "./github";
import { getSetting, saveSettings, setSetting, tableCounts } from "./store";
import type { RepoConfig, SettingsBundle } from "./types";

export async function getSettingsBundle(): Promise<SettingsBundle> {
  const [collab, mother, defaults, drive, driveState, token, passcode, authSecret, logsFolderId, rootFolderId] =
    await Promise.all([
      getRepoConfig("collab", false),
      getRepoConfig("mother", false),
      getRepoDefaults(),
      driveStatus(),
      getDriveState(),
      envVar("GITHUB_TOKEN"),
      envVar("MANAGER_PASSCODE"),
      envVar("AUTH_SECRET"),
      envVar("GOOGLE_DRIVE_LOGS_FOLDER_ID"),
      envVar("GOOGLE_DRIVE_ROOT_FOLDER_ID"),
    ]);

  const [autoRaw, limitRaw, counts] = await Promise.all([
    getSetting("sync.auto"),
    getSetting("sync.limit"),
    tableCounts(),
  ]);

  return {
    repos: { collab, mother },
    defaults,
    env: {
      githubToken: Boolean(token),
      driveServiceAccount: drive.hasServiceAccount,
      driveFolder: drive.hasFolder,
      passcode: Boolean(passcode),
      authSecret: Boolean(authSecret),
      workerName: "windows-agent-management",
      driveFolderId: logsFolderId ?? rootFolderId ?? null,
    },
    sync: {
      auto: autoRaw == null ? drive.configured : autoRaw === "1",
      limit: Number(limitRaw ?? 20) || 20,
      lastSyncAt: driveState.lastSyncAt,
      lastError: driveState.lastError,
    },
    data: counts,
    drive: {
      configured: drive.configured,
      hasServiceAccount: drive.hasServiceAccount,
      hasFolder: drive.hasFolder,
      accountsEmail: drive.accountsEmail,
    },
    version: APP_VERSION,
  };
}

export interface SettingsPayload {
  repos?: {
    collab?: Partial<RepoConfig>;
    mother?: Partial<RepoConfig>;
  };
  sync?: {
    auto?: boolean;
    limit?: number;
  };
}

function mergeRepo(current: RepoConfig, patch?: Partial<RepoConfig>): RepoConfig {
  return {
    owner: (patch?.owner ?? current.owner).trim(),
    repo: (patch?.repo ?? current.repo).trim(),
    branch: (patch?.branch ?? current.branch).trim(),
  };
}

export async function updateSettings(payload: SettingsPayload): Promise<SettingsBundle> {
  if (!payload || typeof payload !== "object") {
    throw new AppError("داده‌ی تنظیمات معتبر نیست.", { status: 400, code: "bad_settings" });
  }

  const changedKinds: RepoKind[] = [];
  for (const kind of ["collab", "mother"] as RepoKind[]) {
    const patch = payload.repos?.[kind];
    if (!patch) continue;
    const current = await getRepoConfig(kind, false);
    const merged = mergeRepo(current, patch);
    const error = validateRepoConfig(merged);
    if (error) {
      throw new AppError(error, {
        status: 422,
        code: "invalid_repo",
        hint: "مثال درست: مالک soheylfriend-MAJIDgit، مخزن Windows-Agent-hamkar، شاخه arena/beecb74c-...",
      });
    }
    if (merged.owner !== current.owner || merged.repo !== current.repo || merged.branch !== current.branch) {
      await saveRepoConfig(kind, merged);
      changedKinds.push(kind);
    }
  }

  if (payload.sync) {
    if (typeof payload.sync.auto === "boolean") {
      await setSetting("sync.auto", payload.sync.auto ? "1" : "0");
    }
    if (payload.sync.limit != null) {
      const limit = Number(payload.sync.limit);
      if (!Number.isFinite(limit) || limit < 5 || limit > 40) {
        throw new AppError("سقف همگام‌سازی باید بین ۵ و ۴۰ باشد.", { status: 422, code: "invalid_limit" });
      }
      await setSetting("sync.limit", String(Math.round(limit)));
    }
  }

  if (changedKinds.length) {
    clearRepoConfigCache();
    for (const kind of changedKinds) {
      try {
        invalidateArchiveCache(await getRepoConfig(kind, false));
      } catch {
        // نادیده بگیر
      }
    }
  }

  return getSettingsBundle();
}

export async function getSyncLimit(): Promise<number> {
  try {
    const raw = await getSetting("sync.limit");
    const value = Number(raw ?? 20);
    return Number.isFinite(value) ? Math.min(Math.max(value, 5), 40) : 20;
  } catch {
    return 20;
  }
}

export async function getAutoSyncEnabled(): Promise<boolean> {
  try {
    const raw = await getSetting("sync.auto");
    if (raw != null) return raw === "1";
    return (await driveStatus()).configured;
  } catch {
    return false;
  }
}

export async function saveKey(key: string, value: string): Promise<void> {
  await saveSettings({ [key]: value });
}
