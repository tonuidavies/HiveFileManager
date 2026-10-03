import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import * as FS from '../native/HiveStorage';
import { useUI } from '../components/Overlays';
import { useNav } from '../navigation';
import { useStore } from './store';
import { moveToTrash } from './trash';
import { onTaskCompleted, suppressAppOpen } from '../ads/AdManager';
import { extOf, formatBytes, formatFullDate, isTextEditable, kindOf, parentOf, displayPath } from '../utils/files';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function useFileActions() {
  const ui = useUI();
  const nav = useNav();
  const { settings, toggleFavorite, clipboard, setClipboard, bumpRefresh } = useStore();

  const haptic = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const openExternally = useCallback(
    (item, mime = null) => {
      suppressAppOpen();
      let ok = false;
      try {
        ok = FS.openFile(item.path, mime);
      } catch {}
      if (!ok) ui.toast('No app found to open this file');
    },
    [ui]
  );

  const extract = useCallback(
    async (item) => {
      ui.progress('Extracting…');
      try {
        const out = await FS.unzip(item.path, parentOf(item.path));
        ui.progress(null);
        bumpRefresh();
        ui.toast(`Extracted to ${out.slice(out.lastIndexOf('/') + 1)}`);
        onTaskCompleted();
      } catch (e) {
        ui.progress(null);
        ui.alert('Could not extract', e?.message || 'The archive may be damaged or password protected.');
      }
    },
    [ui, bumpRefresh]
  );

  const openItem = useCallback(
    (item, siblings) => {
      if (item.isDir) {
        nav.push('browser', { path: item.path });
        return;
      }
      const kind = kindOf(item);
      if (kind === 'image') {
        const images = (siblings || [item]).filter((i) => !i.isDir && kindOf(i) === 'image');
        const index = Math.max(0, images.findIndex((i) => i.path === item.path));
        nav.push('viewer', { items: images.length ? images : [item], index });
        return;
      }
      if (isTextEditable(item)) {
        nav.push('editor', { item });
        return;
      }
      if (kind === 'archive' && extOf(item.name) === 'zip') {
        ui.sheet({
          title: item.name,
          subtitle: formatBytes(item.size),
          actions: [
            { label: 'Extract here', icon: 'package-variant', onPress: () => extract(item) },
            { label: 'Open with another app', icon: 'open-in-new', onPress: () => openExternally(item) },
          ],
        });
        return;
      }
      openExternally(item);
    },
    [nav, ui, extract, openExternally]
  );

  const deleteItems = useCallback(
    async (items, { permanent = false } = {}) => {
      if (!items.length) return false;
      const toTrash = settings.useTrash && !permanent;
      if (settings.confirmDelete || !toTrash) {
        const ok = await ui.confirm({
          title: toTrash ? `Move ${plural(items.length, 'item')} to Trash?` : `Delete ${plural(items.length, 'item')} forever?`,
          message: toTrash
            ? 'You can restore them from Trash for 30 days.'
            : items.length === 1
              ? `"${items[0].name}" will be permanently deleted.`
              : 'These items will be permanently deleted. This cannot be undone.',
          confirmText: toTrash ? 'Move to Trash' : 'Delete',
          destructive: true,
          icon: toTrash ? 'trash-can-outline' : 'delete-forever',
        });
        if (!ok) return false;
      }
      ui.progress(toTrash ? 'Moving to Trash…' : 'Deleting…');
      let failed = 0;
      if (toTrash) {
        failed = (await moveToTrash(items)).failed;
      } else {
        for (const it of items) {
          try {
            await FS.remove(it.path);
          } catch {
            failed++;
          }
        }
      }
      ui.progress(null);
      bumpRefresh();
      const done = items.length - failed;
      ui.toast(failed ? `${done} deleted, ${failed} failed` : toTrash ? `${plural(done, 'item')} moved to Trash` : `${plural(done, 'item')} deleted`);
      onTaskCompleted();
      return true;
    },
    [settings.useTrash, settings.confirmDelete, ui, bumpRefresh]
  );

  const renameItem = useCallback(
    async (item) => {
      const name = await ui.prompt({ title: 'Rename', initial: item.name, placeholder: 'New name', confirmText: 'Rename' });
      if (!name || name === item.name) return;
      try {
        await FS.rename(item.path, name);
        bumpRefresh();
        ui.toast('Renamed');
      } catch (e) {
        ui.alert('Could not rename', e?.message);
      }
    },
    [ui, bumpRefresh]
  );

  const shareItems = useCallback(
    (items) => {
      const files = items.filter((i) => !i.isDir);
      if (!files.length) {
        ui.toast('Folders can’t be shared. Compress them first.');
        return;
      }
      suppressAppOpen();
      try {
        FS.shareFiles(files.map((f) => f.path));
      } catch {
        ui.toast('Could not share');
      }
    },
    [ui]
  );

  const toClipboard = useCallback(
    (items, mode) => {
      setClipboard({ mode, items });
      ui.toast(`${plural(items.length, 'item')} ready to ${mode}. Open a folder and tap Paste.`);
    },
    [setClipboard, ui]
  );

  const paste = useCallback(
    async (destDir) => {
      if (!clipboard) return;
      const { mode, items } = clipboard;
      ui.progress(mode === 'move' ? 'Moving…' : 'Copying…');
      let failed = 0;
      for (const it of items) {
        try {
          if (mode === 'move') await FS.move(it.path, destDir);
          else await FS.copy(it.path, destDir);
        } catch {
          failed++;
        }
      }
      ui.progress(null);
      setClipboard(null);
      bumpRefresh();
      const done = items.length - failed;
      ui.toast(failed ? `${done} done, ${failed} failed` : `${plural(done, 'item')} ${mode === 'move' ? 'moved' : 'copied'}`);
      onTaskCompleted();
    },
    [clipboard, ui, setClipboard, bumpRefresh]
  );

  const compress = useCallback(
    async (items) => {
      if (!items.length) return;
      const dir = parentOf(items[0].path);
      const base = items.length === 1 ? items[0].name.replace(/\.[^.]+$/, '') : 'Archive';
      const name = await ui.prompt({ title: 'Compress to ZIP', initial: `${base}.zip`, confirmText: 'Compress' });
      if (!name) return;
      ui.progress('Compressing…');
      try {
        const out = await FS.zip(
          items.map((i) => i.path),
          `${dir}/${name.toLowerCase().endsWith('.zip') ? name : name + '.zip'}`
        );
        ui.progress(null);
        bumpRefresh();
        ui.toast(`Created ${out.slice(out.lastIndexOf('/') + 1)}`);
        onTaskCompleted();
      } catch (e) {
        ui.progress(null);
        ui.alert('Could not compress', e?.message);
      }
    },
    [ui, bumpRefresh]
  );

  const showDetails = useCallback(
    async (item) => {
      ui.progress('Reading details…');
      try {
        const d = await FS.getDetails(item.path);
        ui.progress(null);
        const lines = [
          `Location: ${displayPath(parentOf(d.path), FS.ROOT)}`,
          `Size: ${formatBytes(d.size, 2)}`,
          d.isDir ? `Contains: ${plural(d.files || 0, 'file')}, ${plural(d.folders || 0, 'folder')}` : `Type: ${d.mime || extOf(d.name).toUpperCase() || 'Unknown'}`,
          `Modified: ${formatFullDate(d.mtime)}`,
          `Hidden: ${d.name.startsWith('.') ? 'Yes' : 'No'}`,
        ];
        ui.alert(d.name, lines.join('\n'));
      } catch (e) {
        ui.progress(null);
        ui.alert('Details unavailable', e?.message);
      }
    },
    [ui]
  );

  const showMore = useCallback(
    (item, extra = {}) => {
      const fav = settings.favorites.includes(item.path);
      const isZip = !item.isDir && extOf(item.name) === 'zip';
      ui.sheet({
        title: item.name,
        subtitle: item.isDir ? plural(item.count || 0, 'item') : `${formatBytes(item.size)} · ${formatFullDate(item.mtime)}`,
        actions: [
          !item.isDir && { label: 'Open with…', icon: 'open-in-new', onPress: () => openExternally(item, 'chooser') },
          extra.onSelect && { label: 'Select', icon: 'checkbox-marked-circle-outline', onPress: () => extra.onSelect(item) },
          !item.isDir && { label: 'Share', icon: 'share-variant', onPress: () => shareItems([item]) },
          { label: 'Copy', icon: 'content-copy', onPress: () => toClipboard([item], 'copy') },
          { label: 'Move', icon: 'folder-move-outline', onPress: () => toClipboard([item], 'move') },
          { label: 'Rename', icon: 'form-textbox', onPress: () => renameItem(item) },
          isZip
            ? { label: 'Extract here', icon: 'package-variant', onPress: () => extract(item) }
            : { label: 'Compress (ZIP)', icon: 'zip-box-outline', onPress: () => compress([item]) },
          item.isDir && {
            label: fav ? 'Remove from favorites' : 'Add to favorites',
            icon: fav ? 'star-off-outline' : 'star-outline',
            onPress: () => {
              toggleFavorite(item.path);
              ui.toast(fav ? 'Removed from favorites' : 'Added to favorites');
            },
          },
          extra.showInFolder && {
            label: 'Show in folder',
            icon: 'folder-search-outline',
            onPress: () => nav.push('browser', { path: parentOf(item.path), highlight: item.path }),
          },
          { label: 'Details', icon: 'information-outline', onPress: () => showDetails(item) },
          { label: 'Delete', icon: 'trash-can-outline', destructive: true, onPress: () => deleteItems([item]) },
        ],
      });
    },
    [settings.favorites, ui, openExternally, shareItems, toClipboard, renameItem, extract, compress, toggleFavorite, nav, showDetails, deleteItems]
  );

  return {
    haptic,
    openItem,
    openExternally,
    deleteItems,
    renameItem,
    shareItems,
    toClipboard,
    paste,
    compress,
    extract,
    showDetails,
    showMore,
  };
}
