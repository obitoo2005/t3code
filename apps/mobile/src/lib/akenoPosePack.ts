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

export type RiasSpriteStyle = "bust" | "uniform";
export type RiasSpriteMood =
  | "working"
  | "done"
  | "stopped"
  | "failed"
  | "cute"
  | "happy"
  | "surprised"
  | "sad"
  | "sleepy";

export interface RiasSpriteManifestEntry {
  readonly id: string;
  readonly file: string;
  readonly style: RiasSpriteStyle;
  readonly moods: readonly RiasSpriteMood[];
  readonly caption?: string;
  readonly rev?: string;
}

export type RiasVipLayout = "fullbody" | "portrait";
export type RiasVipMediaType = "image" | "video";

export interface RiasVipManifestEntry {
  readonly id: string;
  readonly file: string;
  readonly layout: RiasVipLayout;
  readonly mediaType?: RiasVipMediaType;
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
  readonly rev?: string;
}

export type CompanionVoiceCharacter = "akeno" | "rias";
export type CompanionVoiceRole = "tap" | "done" | "pickup" | "greet";

export interface CompanionVoiceManifestEntry {
  readonly id: string;
  readonly character: CompanionVoiceCharacter;
  readonly file: string;
  readonly role: CompanionVoiceRole;
  readonly label?: string;
  readonly rev?: string;
}

export interface AkenoPosePackManifest {
  readonly version: number;
  readonly updatedAt?: string;
  readonly baseUrl?: string;
  readonly poses: readonly AkenoPackPoseManifestEntry[];
  readonly riasSprites: readonly RiasSpriteManifestEntry[];
  readonly riasVip: readonly RiasVipManifestEntry[];
  readonly voices: readonly CompanionVoiceManifestEntry[];
}

export interface SyncedAkenoPose {
  readonly id: string;
  readonly uri: string;
  readonly source: ImageSource;
  readonly stance: AkenoPoseStance;
  readonly whisper: string | undefined;
  readonly roles: readonly AkenoPoseRole[];
}

export interface SyncedRiasSprite {
  readonly id: string;
  readonly uri: string;
  readonly source: ImageSource;
  readonly style: RiasSpriteStyle;
  readonly moods: readonly RiasSpriteMood[];
  readonly caption: string | undefined;
}

export interface SyncedRiasVipPortrait {
  readonly id: string;
  readonly uri: string;
  readonly source: ImageSource;
  readonly layout: RiasVipLayout;
  readonly mediaType: RiasVipMediaType;
  readonly title: string | undefined;
  readonly width: number | undefined;
  readonly height: number | undefined;
}

export interface SyncedCompanionVoice {
  readonly id: string;
  readonly character: CompanionVoiceCharacter;
  readonly uri: string;
  readonly role: CompanionVoiceRole;
  readonly label: string | undefined;
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
  readonly riasSprites: readonly SyncedRiasSprite[];
  readonly riasVip: readonly SyncedRiasVipPortrait[];
  readonly voices: readonly SyncedCompanionVoice[];
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
const VALID_VOICE_ROLES = new Set<CompanionVoiceRole>(["tap", "done", "pickup", "greet"]);
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|mkv)(?:[?#].*)?$/i;

export function inferRiasVipMediaType(file: string, explicit?: unknown): RiasVipMediaType {
  if (explicit === "video" || explicit === "image") return explicit;
  return VIDEO_EXT_RE.test(file) ? "video" : "image";
}
const VALID_RIAS_MOODS = new Set<RiasSpriteMood>([
  "working",
  "done",
  "stopped",
  "failed",
  "cute",
  "happy",
  "surprised",
  "sad",
  "sleepy",
]);

/**
 * Deterministic seeded picker for companion sprites so each chat turn or card
 * displays a consistent unique expression without flickering across re-renders.
 */
export function pickSeededItem<T>(
  items: readonly T[],
  seed: string | undefined,
  offset = 0,
): T | undefined {
  if (items.length === 0) return undefined;
  let hash = 0;
  if (seed) {
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
  }
  const index = (Math.abs(hash) + Math.max(0, offset)) % items.length;
  return items[index];
}

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

function parseSafeId(raw: unknown): string {
  const id = typeof raw === "string" ? raw.trim() : "";
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : "";
}

function parseSafeFile(raw: unknown): string {
  const file = typeof raw === "string" ? raw.trim() : "";
  if (!file) return "";
  if (/^https?:\/\//i.test(file)) return file;
  return isSafeRelativeFilePath(file) ? file : "";
}

function parseSafeRev(raw: unknown): string | undefined {
  const rev = typeof raw === "string" ? raw.trim() : "";
  return /^[A-Za-z0-9_-]{1,40}$/.test(rev) ? rev : undefined;
}

/** Validates and normalizes a remote or cached pose pack manifest (v1 & v2). */
export function parseAkenoPosePackManifest(raw: unknown): AkenoPosePackManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  const version =
    typeof candidate.version === "number" && Number.isFinite(candidate.version)
      ? candidate.version
      : 1;
  const updatedAt = typeof candidate.updatedAt === "string" ? candidate.updatedAt : undefined;
  const baseUrl = typeof candidate.baseUrl === "string" ? candidate.baseUrl.trim() : undefined;
  if (!Array.isArray(candidate.poses)) return null;

  const seenPoseIds = new Set<string>();
  const poses: AkenoPackPoseManifestEntry[] = [];

  for (const item of candidate.poses) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const id = parseSafeId(entry.id);
    const file = parseSafeFile(entry.file);
    if (!id || !file || seenPoseIds.has(id)) continue;

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
    const rev = parseSafeRev(entry.rev);

    seenPoseIds.add(id);
    poses.push({
      id,
      file,
      stance,
      ...(whisper ? { whisper } : {}),
      roles: roles.length > 0 ? roles : ["showcase"],
      ...(rev ? { rev } : {}),
    });
  }

  const seenRiasIds = new Set<string>();
  const riasSprites: RiasSpriteManifestEntry[] = [];
  if (Array.isArray(candidate.riasSprites)) {
    for (const item of candidate.riasSprites) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const id = parseSafeId(entry.id);
      const file = parseSafeFile(entry.file);
      if (!id || !file || seenRiasIds.has(id)) continue;

      const style: RiasSpriteStyle = entry.style === "uniform" ? "uniform" : "bust";
      const rawMoods = Array.isArray(entry.moods) ? entry.moods : ["cute"];
      const moods = rawMoods.filter(
        (mood): mood is RiasSpriteMood =>
          typeof mood === "string" && VALID_RIAS_MOODS.has(mood as RiasSpriteMood),
      );
      const caption =
        typeof entry.caption === "string" && entry.caption.trim().length > 0
          ? entry.caption.trim()
          : undefined;
      const rev = parseSafeRev(entry.rev);

      seenRiasIds.add(id);
      riasSprites.push({
        id,
        file,
        style,
        moods: moods.length > 0 ? moods : ["cute"],
        ...(caption ? { caption } : {}),
        ...(rev ? { rev } : {}),
      });
    }
  }

  const seenVipIds = new Set<string>();
  const riasVip: RiasVipManifestEntry[] = [];
  if (Array.isArray(candidate.riasVip)) {
    for (const item of candidate.riasVip) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const id = parseSafeId(entry.id);
      const file = parseSafeFile(entry.file);
      if (!id || !file || seenVipIds.has(id)) continue;

      const layout: RiasVipLayout = entry.layout === "fullbody" ? "fullbody" : "portrait";
      const explicitMediaType =
        entry.mediaType === "video" || entry.mediaType === "image"
          ? entry.mediaType
          : VIDEO_EXT_RE.test(file)
            ? "video"
            : undefined;
      const title =
        typeof entry.title === "string" && entry.title.trim().length > 0
          ? entry.title.trim()
          : undefined;
      const width =
        typeof entry.width === "number" && Number.isFinite(entry.width) && entry.width > 0
          ? entry.width
          : undefined;
      const height =
        typeof entry.height === "number" && Number.isFinite(entry.height) && entry.height > 0
          ? entry.height
          : undefined;
      const rev = parseSafeRev(entry.rev);

      seenVipIds.add(id);
      riasVip.push({
        id,
        file,
        layout,
        ...(explicitMediaType ? { mediaType: explicitMediaType } : {}),
        ...(title ? { title } : {}),
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        ...(rev ? { rev } : {}),
      });
    }
  }

  const seenVoiceIds = new Set<string>();
  const voices: CompanionVoiceManifestEntry[] = [];
  if (Array.isArray(candidate.voices)) {
    for (const item of candidate.voices) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const id = parseSafeId(entry.id);
      const file = parseSafeFile(entry.file);
      const character: CompanionVoiceCharacter | null =
        entry.character === "akeno" || entry.character === "rias" ? entry.character : null;
      if (!id || !file || !character) continue;
      const voiceKey = `${character}:${id}`;
      if (seenVoiceIds.has(voiceKey)) continue;

      const role: CompanionVoiceRole =
        typeof entry.role === "string" && VALID_VOICE_ROLES.has(entry.role as CompanionVoiceRole)
          ? (entry.role as CompanionVoiceRole)
          : "tap";
      const label =
        typeof entry.label === "string" && entry.label.trim().length > 0
          ? entry.label.trim()
          : undefined;
      const rev = parseSafeRev(entry.rev);

      seenVoiceIds.add(voiceKey);
      voices.push({
        id,
        character,
        file,
        role,
        ...(label ? { label } : {}),
        ...(rev ? { rev } : {}),
      });
    }
  }

  return {
    version,
    ...(updatedAt ? { updatedAt } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    poses,
    riasSprites,
    riasVip,
    voices,
  };
}

/** Resolves the download URL for one asset entry from pack URL + optional manifest baseUrl. */
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

function buildPrefixedCacheFileName(
  prefix: string,
  entry: { readonly id: string; readonly file: string; readonly rev?: string },
): string {
  const extMatch = /\.([A-Za-z0-9]{2,6})(?:[?#].*)?$/.exec(entry.file);
  const ext = extMatch ? extMatch[1]!.toLowerCase() : "webp";
  const base = prefix ? `${prefix}-${entry.id}` : entry.id;
  return entry.rev ? `${base}-${entry.rev}.${ext}` : `${base}.${ext}`;
}

/** Deterministic local cache filename for Akeno poses (keeps existing cache warm). */
export function buildAkenoPoseCacheFileName(entry: AkenoPackPoseManifestEntry): string {
  return buildPrefixedCacheFileName("", entry);
}

export function buildRiasSpriteCacheFileName(entry: RiasSpriteManifestEntry): string {
  return buildPrefixedCacheFileName("rias", entry);
}

export function buildRiasVipCacheFileName(entry: RiasVipManifestEntry): string {
  return buildPrefixedCacheFileName("rias-vip", entry);
}

export function buildCompanionVoiceCacheFileName(entry: CompanionVoiceManifestEntry): string {
  return buildPrefixedCacheFileName(`voice-${entry.character}`, entry);
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
  riasSprites: [],
  riasVip: [],
  voices: [],
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

async function readCachedAssetsFromDisk(): Promise<{
  readonly poses: readonly SyncedAkenoPose[];
  readonly riasSprites: readonly SyncedRiasSprite[];
  readonly riasVip: readonly SyncedRiasVipPortrait[];
  readonly voices: readonly SyncedCompanionVoice[];
}> {
  try {
    const { File, posesDir, manifestFile } = await getPackDirectories();
    if (!manifestFile.exists) {
      return { poses: [], riasSprites: [], riasVip: [], voices: [] };
    }
    const rawText = await manifestFile.text();
    const manifest = parseAkenoPosePackManifest(JSON.parse(rawText));
    if (!manifest) {
      return { poses: [], riasSprites: [], riasVip: [], voices: [] };
    }

    const poses: SyncedAkenoPose[] = [];
    for (const entry of manifest.poses) {
      const localFile = new File(posesDir, buildAkenoPoseCacheFileName(entry));
      if (!localFile.exists) continue;
      poses.push({
        id: entry.id,
        uri: localFile.uri,
        source: { uri: localFile.uri },
        stance: entry.stance,
        whisper: entry.whisper,
        roles: entry.roles,
      });
    }

    const riasSprites: SyncedRiasSprite[] = [];
    for (const entry of manifest.riasSprites) {
      const localFile = new File(posesDir, buildRiasSpriteCacheFileName(entry));
      if (!localFile.exists) continue;
      riasSprites.push({
        id: entry.id,
        uri: localFile.uri,
        source: { uri: localFile.uri },
        style: entry.style,
        moods: entry.moods,
        caption: entry.caption,
      });
    }

    const riasVip: SyncedRiasVipPortrait[] = [];
    for (const entry of manifest.riasVip) {
      const localFile = new File(posesDir, buildRiasVipCacheFileName(entry));
      if (!localFile.exists) continue;
      riasVip.push({
        id: entry.id,
        uri: localFile.uri,
        source: { uri: localFile.uri },
        layout: entry.layout,
        mediaType: inferRiasVipMediaType(entry.file, entry.mediaType),
        title: entry.title,
        width: entry.width,
        height: entry.height,
      });
    }

    const voices: SyncedCompanionVoice[] = [];
    for (const entry of manifest.voices) {
      const localFile = new File(posesDir, buildCompanionVoiceCacheFileName(entry));
      if (!localFile.exists) continue;
      voices.push({
        id: entry.id,
        character: entry.character,
        uri: localFile.uri,
        role: entry.role,
        label: entry.label,
      });
    }

    return { poses, riasSprites, riasVip, voices };
  } catch {
    return { poses: [], riasSprites: [], riasVip: [], voices: [] };
  }
}

export async function ensureAkenoPosePackLoaded(): Promise<void> {
  if (cacheLoadPromise) return cacheLoadPromise;
  cacheLoadPromise = (async () => {
    const [config, cached] = await Promise.all([
      resolveActivePackConfig(),
      readCachedAssetsFromDisk(),
    ]);
    const totalCached =
      cached.poses.length +
      cached.riasSprites.length +
      cached.riasVip.length +
      cached.voices.length;
    emitSnapshot({
      poses: cached.poses,
      riasSprites: cached.riasSprites,
      riasVip: cached.riasVip,
      voices: cached.voices,
      downloadedCount: totalCached,
      totalCount: totalCached,
      configSource: config.source,
      configuredUrl: config.url,
      hasToken: Boolean(config.token),
      status: totalCached > 0 ? "synced" : config.url ? "idle" : "unconfigured",
    });
  })();
  return cacheLoadPromise;
}

/**
 * Syncs Akeno poses, Rias sprites, and VIP Rias portraits from the configured .env or
 * custom private pack URL into permanent device storage. Only downloads missing/updated files.
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
    const existingTotal =
      snapshot.poses.length +
      snapshot.riasSprites.length +
      snapshot.riasVip.length +
      snapshot.voices.length;

    if (!config.url) {
      return emitSnapshot({
        status: existingTotal > 0 ? "synced" : "unconfigured",
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
      const downloadQueue: Array<{
        readonly rawUrl: string;
        readonly cacheName: string;
      }> = [];

      let completedCount = 0;

      const registerItem = (cacheName: string, rawUrl: string) => {
        expectedFileNames.add(cacheName);
        const existing = new File(posesDir, cacheName);
        if (existing.exists) {
          completedCount += 1;
        } else {
          downloadQueue.push({ rawUrl, cacheName });
        }
      };

      for (const entry of manifest.poses) {
        registerItem(
          buildAkenoPoseCacheFileName(entry),
          resolveAkenoPoseFileUrl(config.url, manifest.baseUrl, entry.file),
        );
      }
      for (const entry of manifest.riasSprites) {
        registerItem(
          buildRiasSpriteCacheFileName(entry),
          resolveAkenoPoseFileUrl(config.url, undefined, entry.file),
        );
      }
      for (const entry of manifest.riasVip) {
        registerItem(
          buildRiasVipCacheFileName(entry),
          resolveAkenoPoseFileUrl(config.url, undefined, entry.file),
        );
      }
      for (const entry of manifest.voices) {
        registerItem(
          buildCompanionVoiceCacheFileName(entry),
          resolveAkenoPoseFileUrl(config.url, undefined, entry.file),
        );
      }

      const totalAssets =
        manifest.poses.length +
        manifest.riasSprites.length +
        manifest.riasVip.length +
        manifest.voices.length;

      emitSnapshot({
        downloadedCount: completedCount,
        totalCount: totalAssets,
      });

      let failedDownloads = 0;
      for (let i = 0; i < downloadQueue.length; i += DOWNLOAD_CONCURRENCY) {
        const batch = downloadQueue.slice(i, i + DOWNLOAD_CONCURRENCY);
        await Promise.all(
          batch.map(async ({ rawUrl, cacheName }) => {
            const fileRequest = buildAkenoPackRequest(rawUrl, config.token);
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
          totalCount: totalAssets,
        });
      }

      // Clean up stale cached files no longer referenced in manifest.json
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

      const readyRiasSprites: SyncedRiasSprite[] = [];
      for (const entry of manifest.riasSprites) {
        const localFile = new File(posesDir, buildRiasSpriteCacheFileName(entry));
        if (!localFile.exists) continue;
        readyRiasSprites.push({
          id: entry.id,
          uri: localFile.uri,
          source: { uri: localFile.uri },
          style: entry.style,
          moods: entry.moods,
          caption: entry.caption,
        });
      }

      const readyRiasVip: SyncedRiasVipPortrait[] = [];
      for (const entry of manifest.riasVip) {
        const localFile = new File(posesDir, buildRiasVipCacheFileName(entry));
        if (!localFile.exists) continue;
        readyRiasVip.push({
          id: entry.id,
          uri: localFile.uri,
          source: { uri: localFile.uri },
          layout: entry.layout,
          mediaType: inferRiasVipMediaType(entry.file, entry.mediaType),
          title: entry.title,
          width: entry.width,
          height: entry.height,
        });
      }

      const readyVoices: SyncedCompanionVoice[] = [];
      for (const entry of manifest.voices) {
        const localFile = new File(posesDir, buildCompanionVoiceCacheFileName(entry));
        if (!localFile.exists) continue;
        readyVoices.push({
          id: entry.id,
          character: entry.character,
          uri: localFile.uri,
          role: entry.role,
          label: entry.label,
        });
      }

      const readyTotal =
        readyPoses.length +
        readyRiasSprites.length +
        readyRiasVip.length +
        readyVoices.length;
      return emitSnapshot({
        status: failedDownloads > 0 && readyTotal === 0 ? "error" : "synced",
        poses: readyPoses,
        riasSprites: readyRiasSprites,
        riasVip: readyRiasVip,
        voices: readyVoices,
        downloadedCount: readyTotal,
        totalCount: totalAssets,
        lastSyncedAt: Date.now(),
        errorMessage:
          failedDownloads > 0
            ? `Synced ${readyTotal}/${totalAssets} assets (${failedDownloads} failed).`
            : null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not sync asset pack.";
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

/** React hook returning the live synced Akeno + Rias pack state and auto-syncing once on mount. */
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
