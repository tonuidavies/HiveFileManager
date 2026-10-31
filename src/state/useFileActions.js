import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import * as FS from '../native/HiveStorage';
import { useUI } from '../components/Overlays';
import { useNav } from '../navigation';
import { useStore } from './store';
import { moveToTrash } from './trash';
import { onTaskCompleted, suppressAppOpen } from '../ads/AdManager';
import { useT } from '../i18n';
import { extOf, formatBytes, formatFullDate, isTextEditable, kindOf, parentOf, displayPath } from '../utils/files';

export function useFileActions() {
  const tx = useT();
  const plural = useCallback((n) => tx('items', { count: n }), [tx]);
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
      if (!ok) ui.toast(tx('no_app'));
    },
    [ui, tx]
  );

  const extract = useCallback(
    async (item) => {
      ui.progress(tx('extracting'));
      try {
        const out = await FS.unzip(item.path, parentOf(item.path));
        ui.progress(null);
        bumpRefresh();
        ui.toast(tx('extracted_to', { name: out.slice(out.lastIndexOf('/') + 1) }));
        onTaskCompleted();
      } catch (e) {
        ui.progress(null);
        ui.alert(tx('could_not_extract'), e?.message || tx('archive_damaged'));
      }
    },
    [ui, bumpRefresh, tx]
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
            { label: tx('extract_here'), icon: 'package-variant', onPress: () => extract(item) },
            { label: tx('open_other_app'), icon: 'open-in-new', onPress: () => openExternally(item) },
          ],
        });
        return;
      }
      openExternally(item);
    },
    [nav, ui, extract, openExternally, tx]
  );

  const deleteItems = useCallback(
    async (items, { permanent = false } = {}) => {
      if (!items.length) return false;
      const toTrash = settings.useTrash && !permanent;
      if (settings.confirmDelete || !toTrash) {
        const ok = await ui.confirm({
          title: toTrash ? tx('move_trash_q', { items: plural(items.length) }) : tx('delete_forever_q', { items: plural(items.length) }),
          message: toTrash
            ? tx('restore_30_days')
            : items.length === 1
              ? tx('delete_one_msg', { name: items[0].name })
              : tx('delete_many_msg'),
          confirmText: toTrash ? tx('move_to_trash') : tx('delete'),
          destructive: true,
          icon: toTrash ? 'trash-can-outline' : 'delete-forever',
        });
        if (!ok) return false;
      }
      ui.progress(toTrash ? tx('moving_trash') : tx('deleting'));
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
      ui.toast(failed ? tx('n_deleted_failed', { done, failed }) : toTrash ? tx('items_moved_trash', { items: plural(done) }) : tx('items_deleted', { items: plural(done) }));
      onTaskCompleted();
      return true;
    },
    [settings.useTrash, settings.confirmDelete, ui, bumpRefresh, tx, plural]
  );

  const renameItem = useCallback(
    async (item) => {
      const name = await ui.prompt({ title: tx('rename'), initial: item.name, placeholder: tx('new_name'), confirmText: tx('rename') });
      if (!name || name === item.name) return;
      try {
        await FS.rename(item.path, name);
        bumpRefresh();
        ui.toast(tx('renamed'));
      } catch (e) {
        ui.alert(tx('could_not_rename'), e?.message);
      }
    },
    [ui, bumpRefresh, tx]
  );

  const shareItems = useCallback(
    (items) => {
      const files = items.filter((i) => !i.isDir);
      if (!files.length) {
        ui.toast(tx('folders_cant_share'));
        return;
      }
      suppressAppOpen();
      try {
        FS.shareFiles(files.map((f) => f.path));
      } catch {
        ui.toast(tx('could_not_share'));
      }
    },
    [ui, tx]
  );

  const toClipboard = useCallback(
    (items, mode) => {
      setClipboard({ mode, items });
      ui.toast(tx(mode === 'move' ? 'ready_move' : 'ready_copy', { items: plural(items.length) }));
    },
    [setClipboard, ui, tx, plural]
  );

  const paste = useCallback(
    async (destDir) => {
      if (!clipboard) return;
      const { mode, items } = clipboard;
      ui.progress(mode === 'move' ? tx('moving') : tx('copying'));
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
      ui.toast(failed ? tx('n_done_failed', { done, failed }) : tx(mode === 'move' ? 'items_moved' : 'items_copied', { items: plural(done) }));
      onTaskCompleted();
    },
    [clipboard, ui, setClipboard, bumpRefresh, tx, plural]
  );

  const compress = useCallback(
    async (items) => {
      if (!items.length) return;
      const dir = parentOf(items[0].path);
      const base = items.length === 1 ? items[0].name.replace(/\.[^.]+$/, '') : 'Archive';
      const name = await ui.prompt({ title: tx('compress_to_zip'), initial: `${base}.zip`, confirmText: tx('compress') });
      if (!name) return;
      ui.progress(tx('compressing'));
      try {
        const out = await FS.zip(
          items.map((i) => i.path),
          `${dir}/${name.toLowerCase().endsWith('.zip') ? name : name + '.zip'}`
        );
        ui.progress(null);
        bumpRefresh();
        ui.toast(tx('created_x', { name: out.slice(out.lastIndexOf('/') + 1) }));
        onTaskCompleted();
      } catch (e) {
        ui.progress(null);
        ui.alert(tx('could_not_compress'), e?.message);
      }
    },
    [ui, bumpRefresh, tx]
  );

  const showDetails = useCallback(
    async (item) => {
      ui.progress(tx('reading_details'));
      try {
        const d = await FS.getDetails(item.path);
        ui.progress(null);
        const lines = [
          tx('det_location', { v: displayPath(parentOf(d.path), FS.ROOT) }),
          tx('det_size', { v: formatBytes(d.size, 2) }),
          d.isDir
            ? tx('det_contains', { files: tx('files', { count: d.files || 0 }), folders: tx('folders', { count: d.folders || 0 }) })
            : tx('det_type', { v: d.mime || extOf(d.name).toUpperCase() || tx('unknown') }),
          tx('det_modified', { v: formatFullDate(d.mtime) }),
          tx('det_hidden', { v: d.name.startsWith('.') ? tx('yes') : tx('no') }),
        ];
        ui.alert(d.name, lines.join('\n'));
      } catch (e) {
        ui.progress(null);
        ui.alert(tx('details_unavailable'), e?.message);
      }
    },
    [ui, tx]
  );

  const showMore = useCallback(
    (item, extra = {}) => {
      const fav = settings.favorites.includes(item.path);
      const isZip = !item.isDir && extOf(item.name) === 'zip';
      ui.sheet({
        title: item.name,
        subtitle: item.isDir ? plural(item.count || 0) : `${formatBytes(item.size)} · ${formatFullDate(item.mtime)}`,
        actions: [
          !item.isDir && { label: tx('open_with_ellipsis'), icon: 'open-in-new', onPress: () => openExternally(item, 'chooser') },
          extra.onSelect && { label: tx('select'), icon: 'checkbox-marked-circle-outline', onPress: () => extra.onSelect(item) },
          !item.isDir && { label: tx('share'), icon: 'share-variant', onPress: () => shareItems([item]) },
          { label: tx('copy'), icon: 'content-copy', onPress: () => toClipboard([item], 'copy') },
          { label: tx('move'), icon: 'folder-move-outline', onPress: () => toClipboard([item], 'move') },
          { label: tx('rename'), icon: 'form-textbox', onPress: () => renameItem(item) },
          isZip
            ? { label: tx('extract_here'), icon: 'package-variant', onPress: () => extract(item) }
            : { label: tx('compress_zip'), icon: 'zip-box-outline', onPress: () => compress([item]) },
          item.isDir && {
            label: fav ? tx('remove_favorite') : tx('add_favorite'),
            icon: fav ? 'star-off-outline' : 'star-outline',
            onPress: () => {
              toggleFavorite(item.path);
              ui.toast(fav ? tx('removed_favorite') : tx('added_favorite'));
            },
          },
          extra.showInFolder && {
            label: tx('show_in_folder'),
            icon: 'folder-search-outline',
            onPress: () => nav.push('browser', { path: parentOf(item.path), highlight: item.path }),
          },
          { label: tx('details'), icon: 'information-outline', onPress: () => showDetails(item) },
          { label: tx('delete'), icon: 'trash-can-outline', destructive: true, onPress: () => deleteItems([item]) },
        ],
      });
    },
    [settings.favorites, ui, openExternally, shareItems, toClipboard, renameItem, extract, compress, toggleFavorite, nav, showDetails, deleteItems, tx, plural]
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
