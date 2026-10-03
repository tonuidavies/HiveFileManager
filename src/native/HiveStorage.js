import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

const Native = Platform.OS === 'android' ? requireOptionalNativeModule('HiveStorage') : null;

export const isNativeAvailable = !!Native;

function need() {
  if (!Native) {
    throw new Error('Storage module not found. Rebuild the app with "npx expo run:android" or an EAS build (Expo Go is not supported).');
  }
  return Native;
}

export const ROOT = Native ? Native.getRootPath() : '/storage/emulated/0';

// ---------------- Permission ----------------
// Android remembers this permission. We only check it silently on launch; the
// user is asked once, and never again unless they revoke it in system settings.
export function hasStorageAccess() {
  if (!Native) return false;
  try {
    return !!Native.hasAllFilesAccess();
  } catch {
    return false;
  }
}

/**
 * Returns:
 *  true  -> access granted now
 *  false -> denied
 *  'settings' -> user was sent to system settings; re-check when the app becomes active
 */
export async function requestStorageAccess() {
  const N = need();
  if (N.needsAllFilesAccessSettings()) {
    N.openAllFilesAccessSettings();
    return 'settings';
  }
  const perms = [
    PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
  ];
  const res = await PermissionsAndroid.requestMultiple(perms);
  const values = Object.values(res);
  if (values.every((v) => v === PermissionsAndroid.RESULTS.GRANTED)) return true;
  if (values.some((v) => v === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) {
    Linking.openSettings();
    return 'settings';
  }
  return false;
}

// ---------------- Storage ----------------
export function storageInfo() {
  try {
    return need().getStorageInfo();
  } catch {
    return { total: 0, free: 0, used: 0 };
  }
}

export const listDir = (path, showHidden) => need().listDir(path, !!showHidden);
export const getDetails = (path) => need().getDetails(path);
export const scanSummary = (recentLimit = 20) => need().scanSummary(recentLimit);
export const queryCategory = (category, limit = 3000) => need().queryCategory(category, limit);
export const search = (base, query, showHidden, limit = 300) => need().search(base, query, !!showHidden, limit);
export const cancelSearch = () => Native && Native.cancelSearch();

export const mkdir = (parent, name) => need().mkdir(parent, name);
export const createFile = (parent, name) => need().createFile(parent, name);
export const rename = (path, newName) => need().rename(path, newName);
export const copy = (src, destDir) => need().copy(src, destDir);
export const move = (src, destDir) => need().move(src, destDir);
export const moveTo = (src, destPath) => need().moveTo(src, destPath);
export const remove = (path) => need().remove(path);
export const zip = (paths, destZip) => need().zip(paths, destZip);
export const unzip = (zipPath, destDir) => need().unzip(zipPath, destDir);
export const readText = (path, maxBytes = 1024 * 1024) => need().readText(path, maxBytes);
export const writeText = (path, text) => need().writeText(path, text);
export const cleanerScan = (largeMinBytes = 100 * 1024 * 1024) => need().cleanerScan(largeMinBytes);
export const openFile = (path, mime = null) => need().openFile(path, mime);
export const shareFiles = (paths) => need().shareFiles(paths);
export const scanFiles = (paths) => Native && Native.scanFiles(paths);

// ---------------- Thumbnails (cached + throttled) ----------------
const thumbCache = new Map();
const pending = new Map();
const queue = [];
let active = 0;
const MAX_ACTIVE = 3;

function pump() {
  while (active < MAX_ACTIVE && queue.length) {
    const { path, resolve } = queue.shift();
    active++;
    need()
      .mediaThumbnail(path)
      .catch(() => null)
      .then((uri) => {
        thumbCache.set(path, uri || null);
        pending.delete(path);
        resolve(uri || null);
      })
      .finally(() => {
        active--;
        pump();
      });
  }
}

export function getCachedThumb(path) {
  return thumbCache.has(path) ? thumbCache.get(path) : undefined;
}

export function mediaThumbnail(path) {
  if (!Native) return Promise.resolve(null);
  if (thumbCache.has(path)) return Promise.resolve(thumbCache.get(path));
  if (pending.has(path)) return pending.get(path);
  const p = new Promise((resolve) => {
    queue.push({ path, resolve });
  });
  pending.set(path, p);
  pump();
  return p;
}
