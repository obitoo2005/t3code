import type { ImageSource } from "expo-image";
import { useEffect, useState } from "react";

import { writeFileAtomically } from "./atomic-file";

export type AkenoPoseStance = "standing" | "perched";
export type AkenoPoseRole = "showcase" | "settle" | "celebration" | "sleepy";

export interface AkenoPackPoseManifestEntry {
  readonly id: string;
  readonly file: string;
  readonly stance: AkenoPoseStance;
  readonly whisper?: string;
  readonly roles: readonly AkenoPoseRole[];
  readonly rev?: string;
}

export interface AkenoPosePackManifest {
  readonly version: number;
  readonly updatedAt?: string;
  readonly baseUrl?: string;
  readonly poses: readonly AkenoPackPoseManifestEntry[];
}

export interface SyncedAkenoPose {
  readonly id: string;
  readonly uri: string;
  readonly source: ImageSource;
  readonly stance: AkenoPoseStance;
  readonly whisper: string | undefined;
  readonly roles: readonly AkenoPoseRole[];
}

export type AkenoPosePackSyncStatus =
  | "idle"
  | "syncing"
  | "synced"
  | "error"
  | "unconfigured";

export type AkenoPosePackConfigSource = "custom" | "env" | "none";

export interface AkenoPosePackSnapshot {
  readonly status: AkenoPosePackSyncStatus;
  readonly poses: readonly SyncedAkenoPose[];
  readonly downloadedCount: number;
  readonly totalCount: number;
  readonly lastSyncedAt: number | null;
  readonly errorMessage: string | null;
  readonly configSource: AkenoPosePackConfigSource;
  readonly configuredUrl: string | null;
  readonly hasToken: boolean;
}

const PACK_DIR_NAME = "akeno-pose-pack";
const PACK_POSES_SUBDIR = "poses";
const PACK_MANIFEST_FILE = "manifest.json";
const SECURE_STORE_URL_KEY = "rias.akeno_pack.url";
const SECURE_STORE_TOKEN_KEY = "rias.akeno_pack.token";
const DOWNLOAD_CONCURRENCY = 6;
const AUTO_SYNC_COOLDOWN_MS = 5 * 60_000;

const VALID_ROLES = new Set<AkenoPoseRole>(["showcase", "settle", "celebration", "sleepy"]);

/**
 * Normalizes a user or .env pack URL into a base URL without trailing slash.
 * Supports:
 * - Full raw/CDN URLs (`https://raw.githubusercontent.com/user/repo/main` or `.../manifest.json`)
 * - GitHub repository URLs (`https://github.com/user/repo`)
 * - GitHub `owner/repo` shorthand (`obitoo2005/rias-assets`)
 */
export function normalizeAkenoPackUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  const shorthandMatch = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:@([A-Za-z0-9_./-]+))?$/.exec(
    trimmed,
  );
  if (shorthandMatch) {
    const [, owner, repo, branch] = shorthandMatch;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch ?? "main"}`;
  }

  const githubRepoMatch =
    /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+))?\/?$/i.exec(
      trimmed,
    );
  if (githubRepoMatch) {
    const [, owner, repo, branch] = githubRepoMatch;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch ?? "main"}`;
  }

  let normalized = trimmed.replace(/\/+$/, "");
  if (normalized.endsWith("/manifest.json")) {
    normalized = normalized.slice(0, -"/manifest.json".length);
  }
  if (!/^https?:\/\//i.test(normalized)) {
    return null;
  }
  return normalized;
}

function isSafeRelativeFilePath(file: string): boolean {
  if (!file || file.startsWith("/") || file.startsWith("\\")) return false;
  if (/^[a-zA-Z]+:\/\//.test(file)) return false;
  const segments = file.split(/[\\/]/);
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

/** Validates and normalizes a remote or cached pose pack manifest. */
export function parseAkenoPosePackManifest(raw: unknown): AkenoPosePackManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  const version = typeof candidate.version === "number" && Number.isFinite(candidate.version)
    ? candidate.version
    : 1;
  const updatedAt = typeof candidate.updatedAt === "string" ? candidate.updatedAt : undefined;
  const baseUrl = typeof candidate.baseUrl === "string" ? candidate.baseUrl.trim() : undefined;
  if (!Array.isArray(candidate.poses)) return null;

  const seenIds = new Set<string>();
  const poses: AkenoPackPoseManifestEntry[] = [];

  for (const item of candidate.poses) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const file = typeof entry.file === "string" ? entry.file.trim() : "";
    if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id) || seenIds.has(id)) continue;
    const isHttpUrl = /^https?:\/\//i.test(file);
    if (!isHttpUrl && !isSafeRelativeFilePath(file)) continue;

    const stance: AkenoPoseStance = entry.stance === "standing" ? "standing" : "perched";
    const whisper =
      typeof entry.whisper === "string" && entry.whisper.trim().length > 0
        ? entry.whisper.trim()
        : undefined;
    const rawRoles = Array.isArray(entry.roles) ? entry.roles : ["showcase"];
    const roles = rawRoles.filter(
      (role): role is AkenoPoseRole =>
        typeof role === "string" && VALID_ROLES.has(role as AkenoPoseRole),
    );
    const rev =
      typeof entry.rev === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(entry.rev.trim())
        ? entry.rev.trim()
        : undefined;

    seenIds.add(id);
    poses.push({
      id,
      file,
      stance,
      ...(whisper ? { whisper } : {}),
      roles: roles.length > 0 ? roles : ["showcase"],
      ...(rev ? { rev } : {}),
    });
  }

  return {
    version,
    ...(updatedAt ? { updatedAt } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    poses,
  };
}

/** Resolves the download URL for one pose entry from pack URL + optional manifest baseUrl. */
export function resolveAkenoPoseFileUrl(
  packBaseUrl: string,
  manifestBaseUrl: string | undefined,
  file: string,
): string {
  if (/^https?:\/\//i.test(file)) {
    return file;
  }
  const cleanPackBase = packBaseUrl.replace(/\/+$/, "");
  const cleanFile = file.replace(/^\/+/, "");
  if (!manifestBaseUrl) {
    return `${cleanPackBase}/${cleanFile}`;
  }
  if (/^https?:\/\//i.test(manifestBaseUrl)) {
    return `${manifestBaseUrl.replace(/\/+$/, "")}/${cleanFile}`;
  }
  const cleanSub = manifestBaseUrl.replace(/^\/+|\/+$/g, "");
  return cleanSub ? `${cleanPackBase}/${cleanSub}/${cleanFile}` : `${cleanPackBase}/${cleanFile}`;
}

export interface AkenoPackRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

const RAW_GITHUB_URL_RE =
  /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i;

/**
 * Builds the fetch/download request for a pack file.
 * GitHub fine-grained PATs (`github_pat_...`) are rejected by `raw.githubusercontent.com`
 * with HTTP 404 on private repos, so authenticated GitHub raw URLs are transparently
 * routed through the GitHub Contents API with `Accept: application/vnd.github.raw+json`.
 */
export function buildAkenoPackRequest(url: string, token: string | null): AkenoPackRequest {
  const rawMatch = token ? RAW_GITHUB_URL_RE.exec(url) : null;
  if (rawMatch && token) {
    const [, owner, repo, ref, filePath] = rawMatch;
    const encodedPath = filePath!
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return {
      url: `https://api.github.com/repos/${encodeURIComponent(owner!)}/${encodeURIComponent(repo!)}/contents/${encodedPath}?ref=${encodeURIComponent(ref!)}`,
      headers: {
        Accept: "application/vnd.github.raw+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "RiasCode-Mobile",
        "Cache-Control": "no-cache",
      },
    };
  }

  const isGitHubApi = /^https?:\/\/api\.github\.com\//i.test(url);
  const headers: Record<string, string> = {
    Accept: isGitHubApi
      ? "application/vnd.github.raw+json"
      : "application/json, image/webp, */*",
    "Cache-Control": "no-cache",
  };
  if (isGitHubApi) {
    headers["X-GitHub-Api-Version"] = "2022-11-28";
    headers["User-Agent"] = "RiasCode-Mobile";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return { url, headers };
}

/** Deterministic local cache filename that automatically busts when `rev` changes. */
export function buildAkenoPoseCacheFileName(entry: AkenoPackPoseManifestEntry): string {
  const extMatch = /\.([A-Za-z0-9]{2,6})(?:[?#].*)?$/.exec(entry.file);
  const ext = extMatch ? extMatch[1]!.toLowerCase() : "webp";
  return entry.rev ? `${entry.id}-${entry.rev}.${ext}` : `${entry.id}.${ext}`;
}

interface ExtraAkenoPackConfig {
  readonly url?: string | null;
  readonly token?: string | null;
}

async function readEnvPackConfig(): Promise<{
  readonly url: string | null;
  readonly token: string | null;
}> {
  let extra: ExtraAkenoPackConfig | undefined;
  try {
    const Constants = (await import("expo-constants")).default;
    extra = (
      Constants.expoConfig?.extra as { readonly akenoPack?: ExtraAkenoPackConfig } | undefined
    )?.akenoPack;
  } catch {
    // Non-native / unit test runtime
  }
  const rawUrl =
    extra?.url?.trim() ||
    process.env.EXPO_PUBLIC_AKENO_PACK_URL?.trim() ||
    process.env.T3CODE_AKENO_PACK_URL?.trim() ||
    null;
  const rawToken =
    extra?.token?.trim() ||
    process.env.EXPO_PUBLIC_AKENO_PACK_TOKEN?.trim() ||
    process.env.T3CODE_AKENO_PACK_TOKEN?.trim() ||
    null;
  return {
    url: normalizeAkenoPackUrl(rawUrl),
    token: rawToken && rawToken.length > 0 ? rawToken : null,
  };
}

async function resolveActivePackConfig(): Promise<{
  readonly url: string | null;
  readonly token: string | null;
  readonly source: AkenoPosePackConfigSource;
}> {
  const envConfig = await readEnvPackConfig();
  try {
    const SecureStore = await import("expo-secure-store");
    const [customUrlRaw, customTokenRaw] = await Promise.all([
      SecureStore.getItemAsync(SECURE_STORE_URL_KEY),
      SecureStore.getItemAsync(SECURE_STORE_TOKEN_KEY),
    ]);
    const customUrl = normalizeAkenoPackUrl(customUrlRaw);
    const customToken = customTokenRaw?.trim() || null;
    if (customUrl || customToken) {
      return {
        url: customUrl ?? envConfig.url,
        token: customToken ?? envConfig.token,
        source: "custom",
      };
    }
  } catch {
    // Ignore secure store errors in non-native or test runtimes.
  }
  if (envConfig.url) {
    return { url: envConfig.url, token: envConfig.token, source: "env" };
  }
  return { url: null, token: null, source: "none" };
}

let snapshot: AkenoPosePackSnapshot = {
  status: "idle",
  poses: [],
  downloadedCount: 0,
  totalCount: 0,
  lastSyncedAt: null,
  errorMessage: null,
  configSource: "none",
  configuredUrl: null,
  hasToken: false,
};

const listeners = new Set<() => void>();
let cacheLoadPromise: Promise<void> | null = null;
let inFlightSyncPromise: Promise<AkenoPosePackSnapshot> | null = null;
let lastAttemptedSyncAt = 0;

function emitSnapshot(patch: Partial<AkenoPosePackSnapshot>): AkenoPosePackSnapshot {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) {
    listener();
  }
  return snapshot;
}

export function getAkenoPosePackSnapshot(): AkenoPosePackSnapshot {
  return snapshot;
}

export function subscribeAkenoPosePack(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function getPackDirectories() {
  const { Directory, File, Paths } = await import("expo-file-system");
  const rootDir = new Directory(Paths.document, PACK_DIR_NAME);
  const posesDir = new Directory(rootDir, PACK_POSES_SUBDIR);
  const manifestFile = new File(rootDir, PACK_MANIFEST_FILE);
  return { Directory, File, rootDir, posesDir, manifestFile };
}

async function readCachedPosesFromDisk(): Promise<readonly SyncedAkenoPose[]> {
  try {
    const { File, posesDir, manifestFile } = await getPackDirectories();
    if (!manifestFile.exists) return [];
    const rawText = await manifestFile.text();
    const manifest = parseAkenoPosePackManifest(JSON.parse(rawText));
    if (!manifest) return [];

    const ready: SyncedAkenoPose[] = [];
    for (const entry of manifest.poses) {
      const localFile = new File(posesDir, buildAkenoPoseCacheFileName(entry));
      if (!localFile.exists) continue;
      ready.push({
        id: entry.id,
        uri: localFile.uri,
        source: { uri: localFile.uri },
        stance: entry.stance,
        whisper: entry.whisper,
        roles: entry.roles,
      });
    }
    return ready;
  } catch {
    return [];
  }
}

export async function ensureAkenoPosePackLoaded(): Promise<void> {
  if (cacheLoadPromise) return cacheLoadPromise;
  cacheLoadPromise = (async () => {
    const [config, cachedPoses] = await Promise.all([
      resolveActivePackConfig(),
      readCachedPosesFromDisk(),
    ]);
    emitSnapshot({
      poses: cachedPoses,
      downloadedCount: cachedPoses.length,
      totalCount: cachedPoses.length,
      configSource: config.source,
      configuredUrl: config.url,
      hasToken: Boolean(config.token),
      status:
        cachedPoses.length > 0
          ? "synced"
          : config.url
            ? "idle"
            : "unconfigured",
    });
  })();
  return cacheLoadPromise;
}

/**
 * Syncs the Akeno pose pack from the configured .env or custom URL into permanent device storage.
 * Only downloads missing or updated pose files; already-cached poses stay 100% offline.
 */
export async function syncAkenoPosePack(options?: {
  readonly force?: boolean;
}): Promise<AkenoPosePackSnapshot> {
  if (inFlightSyncPromise) return inFlightSyncPromise;
  const now = Date.now();
  if (!options?.force && lastAttemptedSyncAt > 0 && now - lastAttemptedSyncAt < AUTO_SYNC_COOLDOWN_MS) {
    return snapshot;
  }
  lastAttemptedSyncAt = now;

  inFlightSyncPromise = (async () => {
    await ensureAkenoPosePackLoaded();
    const config = await resolveActivePackConfig();
    if (!config.url) {
      return emitSnapshot({
        status: snapshot.poses.length > 0 ? "synced" : "unconfigured",
        configSource: config.source,
        configuredUrl: null,
        hasToken: false,
        errorMessage: null,
      });
    }

    emitSnapshot({
      status: "syncing",
      configSource: config.source,
      configuredUrl: config.url,
      hasToken: Boolean(config.token),
      errorMessage: null,
    });

    try {
      const manifestRequest = buildAkenoPackRequest(`${config.url}/manifest.json`, config.token);
      const response = await fetch(manifestRequest.url, {
        headers: manifestRequest.headers,
        cache: "no-store",
      });

      if (!response.ok) {
        const hint =
          response.status === 401 || response.status === 403 || response.status === 404
            ? config.token
              ? `HTTP ${response.status} — check pack URL or token permissions.`
              : `HTTP ${response.status} — private repo needs a read-only token.`
            : `HTTP ${response.status}`;
        return emitSnapshot({
          status: "error",
          errorMessage: hint,
        });
      }

      const manifestJson: unknown = await response.json();
      const manifest = parseAkenoPosePackManifest(manifestJson);
      if (!manifest) {
        return emitSnapshot({
          status: "error",
          errorMessage: "Invalid manifest.json format.",
        });
      }

      const { File, rootDir, posesDir, manifestFile } = await getPackDirectories();
      rootDir.create({ idempotent: true, intermediates: true });
      posesDir.create({ idempotent: true, intermediates: true });

      const expectedFileNames = new Set<string>();
      const missingEntries: Array<{
        readonly entry: AkenoPackPoseManifestEntry;
        readonly cacheName: string;
      }> = [];

      let completedCount = 0;
      for (const entry of manifest.poses) {
        const cacheName = buildAkenoPoseCacheFileName(entry);
        expectedFileNames.add(cacheName);
        const existing = new File(posesDir, cacheName);
        if (existing.exists) {
          completedCount += 1;
        } else {
          missingEntries.push({ entry, cacheName });
        }
      }

      emitSnapshot({
        downloadedCount: completedCount,
        totalCount: manifest.poses.length,
      });

      let failedDownloads = 0;
      for (let i = 0; i < missingEntries.length; i += DOWNLOAD_CONCURRENCY) {
        const batch = missingEntries.slice(i, i + DOWNLOAD_CONCURRENCY);
        await Promise.all(
          batch.map(async ({ entry, cacheName }) => {
            const rawDownloadUrl = resolveAkenoPoseFileUrl(config.url!, manifest.baseUrl, entry.file);
            const fileRequest = buildAkenoPackRequest(rawDownloadUrl, config.token);
            const targetFile = new File(posesDir, cacheName);
            const tempFile = new File(posesDir, `${cacheName}.dl.tmp`);
            try {
              if (tempFile.exists) tempFile.delete();
              await File.downloadFileAsync(fileRequest.url, tempFile, {
                headers: { ...fileRequest.headers },
                idempotent: true,
              });
              tempFile.moveSync(targetFile, { overwrite: true });
              completedCount += 1;
            } catch {
              failedDownloads += 1;
              try {
                if (tempFile.exists) tempFile.delete();
              } catch {}
            }
          }),
        );
        emitSnapshot({
          downloadedCount: completedCount,
          totalCount: manifest.poses.length,
        });
      }

      // Clean up stale cached files that are no longer referenced in manifest.json
      try {
        for (const existing of posesDir.list()) {
          if (existing instanceof File && !expectedFileNames.has(existing.name)) {
            existing.delete();
          }
        }
      } catch {
        // Non-fatal cache housekeeping failure
      }

      await writeFileAtomically(manifestFile, JSON.stringify(manifest));

      const readyPoses: SyncedAkenoPose[] = [];
      for (const entry of manifest.poses) {
        const localFile = new File(posesDir, buildAkenoPoseCacheFileName(entry));
        if (!localFile.exists) continue;
        readyPoses.push({
          id: entry.id,
          uri: localFile.uri,
          source: { uri: localFile.uri },
          stance: entry.stance,
          whisper: entry.whisper,
          roles: entry.roles,
        });
      }

      return emitSnapshot({
        status: failedDownloads > 0 && readyPoses.length === 0 ? "error" : "synced",
        poses: readyPoses,
        downloadedCount: readyPoses.length,
        totalCount: manifest.poses.length,
        lastSyncedAt: Date.now(),
        errorMessage:
          failedDownloads > 0
            ? `Synced ${readyPoses.length}/${manifest.poses.length} poses (${failedDownloads} failed).`
            : null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not sync pose pack.";
      return emitSnapshot({
        status: "error",
        errorMessage: message,
      });
    } finally {
      inFlightSyncPromise = null;
    }
  })();

  return inFlightSyncPromise;
}

export async function saveAkenoPackOverride(input: {
  readonly url: string;
  readonly token?: string;
}): Promise<AkenoPosePackSnapshot> {
  const normalizedUrl = normalizeAkenoPackUrl(input.url);
  if (!normalizedUrl) {
    return emitSnapshot({
      status: "error",
      errorMessage: "Enter a valid HTTPS URL or GitHub owner/repo (e.g. obitoo2005/rias-assets).",
    });
  }
  const SecureStore = await import("expo-secure-store");
  await SecureStore.setItemAsync(SECURE_STORE_URL_KEY, normalizedUrl);
  if (input.token !== undefined) {
    const trimmedToken = input.token.trim();
    if (trimmedToken.length > 0) {
      await SecureStore.setItemAsync(SECURE_STORE_TOKEN_KEY, trimmedToken);
    } else {
      await SecureStore.deleteItemAsync(SECURE_STORE_TOKEN_KEY);
    }
  }
  lastAttemptedSyncAt = 0;
  return syncAkenoPosePack({ force: true });
}

export async function clearAkenoPackOverride(): Promise<AkenoPosePackSnapshot> {
  try {
    const SecureStore = await import("expo-secure-store");
    await Promise.all([
      SecureStore.deleteItemAsync(SECURE_STORE_URL_KEY),
      SecureStore.deleteItemAsync(SECURE_STORE_TOKEN_KEY),
    ]);
  } catch {}
  const config = await resolveActivePackConfig();
  lastAttemptedSyncAt = 0;
  emitSnapshot({
    configSource: config.source,
    configuredUrl: config.url,
    hasToken: Boolean(config.token),
    errorMessage: null,
  });
  if (config.url) {
    return syncAkenoPosePack({ force: true });
  }
  return snapshot;
}

/** React hook returning the live synced Akeno pose pack state and auto-syncing once on mount. */
export function useAkenoPosePack(options?: { readonly autoSync?: boolean }): AkenoPosePackSnapshot {
  const [state, setState] = useState<AkenoPosePackSnapshot>(getAkenoPosePackSnapshot);

  useEffect(() => {
    const unsubscribe = subscribeAkenoPosePack(() => {
      setState(getAkenoPosePackSnapshot());
    });
    void ensureAkenoPosePackLoaded().then(() => {
      if (options?.autoSync !== false) {
        void syncAkenoPosePack();
      }
    });
    return unsubscribe;
  }, [options?.autoSync]);

  return state;
}
