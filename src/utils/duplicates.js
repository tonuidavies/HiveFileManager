import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as FS from '../native/HiveStorage';

const Native = Platform.OS === 'android' ? requireOptionalNativeModule('HiveDuplicates') : null;

/** false when the installed build does not contain the native hashing module yet (needs a rebuild). */
export const duplicatesAvailable = !!Native;

export const SCOPES = [
  { key: 'photos', labelKey: 'dup_scope_photos', icon: 'image-multiple', color: '#EC4899', categories: ['images'] },
  { key: 'videos', labelKey: 'dup_scope_videos', icon: 'play-box-multiple', color: '#8B5CF6', categories: ['videos'] },
  { key: 'audio', labelKey: 'dup_scope_audio', icon: 'music-box-multiple', color: '#F97316', categories: ['audio'] },
  { key: 'docs', labelKey: 'dup_scope_docs', icon: 'file-document-multiple', color: '#3B82F6', categories: ['documents'] },
  { key: 'other', labelKey: 'dup_scope_other', icon: 'zip-box', color: '#10B981', categories: ['archives', 'apks'] },
];

const MAX_FILES_PER_CATEGORY = 60000;
const QUICK_COVERS_ALL = 128 * 1024; // files up to this size are fully read by the quick hash
const BATCH_FILES = 8;
const BATCH_BYTES = 96 * 1024 * 1024;
const yieldToUI = () => new Promise((resolve) => setTimeout(resolve, 0));

class Cancelled extends Error {}
export const isCancelled = (e) => e instanceof Cancelled;

function groupBy(files, keyFn) {
  const map = new Map();
  for (const f of files) {
    const k = keyFn(f);
    if (k === null) continue;
    const list = map.get(k);
    if (list) list.push(f);
    else map.set(k, [f]);
  }
  return map;
}

const onlyDuplicated = (map) => [...map.values()].filter((g) => g.length > 1);

/** Split files into batches so one native call never takes very long (keeps Cancel responsive). */
function batches(files) {
  const out = [];
  let cur = [];
  let bytes = 0;
  for (const f of files) {
    if (cur.length && (cur.length >= BATCH_FILES || bytes + f.size > BATCH_BYTES)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(f);
    bytes += f.size;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function hashAll(files, quick, ctx, phase) {
  const hashes = new Map();
  let done = 0;
  for (const batch of batches(files)) {
    if (ctx.shouldCancel()) throw new Cancelled();
    const res = await Native.hashFiles(batch.map((f) => f.path), quick);
    batch.forEach((f, i) => hashes.set(f.path, res[i] || null));
    done += batch.length;
    ctx.onProgress({ phase, done, total: files.length });
    await yieldToUI();
  }
  return hashes;
}

/**
 * Finds files with identical content.
 *  1. list files of the chosen categories
 *  2. keep only files that share the same size
 *  3. cheap hash (head / middle / tail) to rule out most of them
 *  4. full SHA-1 of what is left, so only byte-for-byte identical files are reported
 * Resolves with an array of sets: { id, size, files: [{ path, name, size, mtime }] } (oldest file first).
 */
export async function findDuplicates({ categories, onProgress = () => {}, shouldCancel = () => false }) {
  if (!Native) throw new Error('HiveDuplicates native module is missing');
  const ctx = { onProgress, shouldCancel };

  // 1. list
  onProgress({ phase: 'list', done: 0, total: 0 });
  const seen = new Map();
  for (const cat of categories) {
    if (shouldCancel()) throw new Cancelled();
    let items = [];
    try {
      items = await FS.queryCategory(cat, MAX_FILES_PER_CATEGORY);
    } catch {}
    for (const it of items) {
      if (!it || !it.path || !(it.size > 0)) continue;
      if (it.path.includes('/.HiveTrash/')) continue;
      if (!seen.has(it.path)) seen.set(it.path, { path: it.path, name: it.name, size: it.size, mtime: it.mtime || 0 });
    }
    await yieldToUI();
  }

  // 2. same size
  onProgress({ phase: 'size', done: 0, total: 0 });
  await yieldToUI();
  let groups = onlyDuplicated(groupBy([...seen.values()], (f) => f.size));

  // 3. quick hash
  if (groups.length) {
    const candidates = groups.flat();
    const quick = await hashAll(candidates, true, ctx, 'hash');
    groups = onlyDuplicated(groupBy(candidates, (f) => (quick.get(f.path) ? `${f.size}:${quick.get(f.path)}` : null)));
  }

  // 4. full hash (files <= 128 KB were already fully read in step 3)
  if (groups.length) {
    const needFull = groups.flat().filter((f) => f.size > QUICK_COVERS_ALL);
    const full = needFull.length ? await hashAll(needFull, false, ctx, 'hash') : new Map();
    const regrouped = [];
    for (const g of groups) {
      if (g[0].size <= QUICK_COVERS_ALL) {
        regrouped.push(g);
        continue;
      }
      regrouped.push(...onlyDuplicated(groupBy(g, (f) => (full.get(f.path) ? `${f.size}:${full.get(f.path)}` : null))));
    }
    groups = regrouped;
  }

  const result = groups.map((files, i) => {
    const sorted = files.slice().sort((a, b) => a.mtime - b.mtime || a.path.length - b.path.length || a.path.localeCompare(b.path));
    return { id: `${sorted[0].size}-${i}`, size: sorted[0].size, files: sorted };
  });
  result.sort((a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1));
  return result;
}

/** Which files to delete when we keep one file per set. keep: 'oldest' | 'newest' */
export function autoSelect(sets, keep = 'oldest') {
  const picked = new Set();
  for (const s of sets) {
    const files = s.files; // sorted oldest -> newest
    const keepIdx = keep === 'newest' ? files.length - 1 : 0;
    files.forEach((f, i) => i !== keepIdx && picked.add(f.path));
  }
  return picked;
}

export const reclaimable = (sets) => sets.reduce((sum, s) => sum + s.size * (s.files.length - 1), 0);
