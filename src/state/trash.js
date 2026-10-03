import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from '../native/HiveStorage';

const TRASH_KEY = '@hive_trash_v1';
export const TRASH_DIR = `${FS.ROOT}/.HiveTrash`;
const KEEP_DAYS = 30;

async function readIndex() {
  try {
    const raw = await AsyncStorage.getItem(TRASH_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

const writeIndex = (list) => AsyncStorage.setItem(TRASH_KEY, JSON.stringify(list)).catch(() => {});

async function ensureTrashDir() {
  try {
    await FS.listDir(TRASH_DIR, true);
  } catch {
    try {
      await FS.mkdir(FS.ROOT, '.HiveTrash');
      await FS.createFile(TRASH_DIR, '.nomedia'); // keep trashed photos out of the gallery
    } catch {}
  }
}

export async function listTrash() {
  const list = await readIndex();
  return list.sort((a, b) => b.deletedAt - a.deletedAt);
}

export async function moveToTrash(items) {
  await ensureTrashDir();
  const list = await readIndex();
  let failed = 0;
  for (const item of items) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const trashPath = await FS.moveTo(item.path, `${TRASH_DIR}/${id}`);
      list.push({
        id,
        name: item.name,
        isDir: !!item.isDir,
        size: item.size || 0,
        origPath: item.path,
        trashPath,
        deletedAt: Date.now(),
      });
    } catch {
      failed++;
    }
  }
  await writeIndex(list);
  return { failed };
}

export async function restoreFromTrash(entries) {
  const ids = new Set(entries.map((e) => e.id));
  const list = await readIndex();
  let failed = 0;
  for (const e of entries) {
    try {
      await FS.moveTo(e.trashPath, e.origPath);
    } catch {
      failed++;
      ids.delete(e.id);
    }
  }
  await writeIndex(list.filter((e) => !ids.has(e.id)));
  return { failed };
}

export async function deleteFromTrash(entries) {
  const ids = new Set(entries.map((e) => e.id));
  const list = await readIndex();
  for (const e of entries) {
    try {
      await FS.remove(e.trashPath);
    } catch {}
  }
  await writeIndex(list.filter((e) => !ids.has(e.id)));
}

export async function purgeOldTrash() {
  const list = await readIndex();
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const old = list.filter((e) => e.deletedAt < cutoff);
  if (old.length) await deleteFromTrash(old);
}

export const TRASH_KEEP_DAYS = KEEP_DAYS;
