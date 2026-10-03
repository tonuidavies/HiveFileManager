import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GradientHeader, EmptyState, Fab, Icon, IconButton } from '../components/UI';
import { FileGridCell, FileRow, ROW_HEIGHT } from '../components/FileItems';
import BannerSlot from '../ads/BannerSlot';
import { onNavigate } from '../ads/AdManager';
import { useTheme } from '../theme';
import { useBackHandler, useNav, useScreen } from '../navigation';
import { useStore } from '../state/store';
import { useUI } from '../components/Overlays';
import { useFileActions } from '../state/useFileActions';
import * as FS from '../native/HiveStorage';
import { nameOf, sortItems } from '../utils/files';

const dirCache = new Map(); // path -> raw items (instant back navigation)

const SORTS = [
  { key: 'name', label: 'Name', icon: 'sort-alphabetical-variant' },
  { key: 'date', label: 'Date modified', icon: 'calendar-clock' },
  { key: 'size', label: 'Size', icon: 'sort-numeric-variant' },
  { key: 'type', label: 'Type', icon: 'shape-outline' },
];

export default function BrowserScreen({ params }) {
  const t = useTheme();
  const nav = useNav();
  const ui = useUI();
  const { focused } = useScreen();
  const { width } = useWindowDimensions();
  const { settings, update, clipboard, setClipboard, refreshToken, toggleFavorite } = useStore();
  const actions = useFileActions();

  const [paths, setPaths] = useState([params.path || FS.ROOT]);
  const current = paths[paths.length - 1];
  const [raw, setRaw] = useState(() => dirCache.get(current) || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [highlight, setHighlight] = useState(params.highlight || null);
  const listRef = useRef(null);
  const offsets = useRef(new Map()); // path -> scroll offset
  const reqId = useRef(0);

  const selecting = selected.size > 0;
  const grid = settings.viewMode === 'grid';
  const columns = width > 600 ? 5 : 4;
  const cellSize = Math.floor((width - 16) / columns);

  const load = useCallback(
    async (path, { silent } = {}) => {
      const id = ++reqId.current;
      if (!silent) setLoading(true);
      try {
        const items = await FS.listDir(path, settings.showHidden);
        if (id !== reqId.current) return;
        dirCache.set(path, items);
        if (dirCache.size > 60) dirCache.delete(dirCache.keys().next().value);
        setRaw(items);
        setError(null);
      } catch (e) {
        if (id !== reqId.current) return;
        setError(e?.message || 'Cannot open this folder');
        setRaw([]);
      }
      if (id === reqId.current) setLoading(false);
    },
    [settings.showHidden]
  );

  // Load when folder changes (show cache instantly, refresh in background)
  useEffect(() => {
    const cached = dirCache.get(current);
    setRaw(cached || null);
    load(current, { silent: !!cached });
  }, [current, load]);

  // Reload after file operations elsewhere
  const firstRefresh = useRef(true);
  useEffect(() => {
    if (firstRefresh.current) {
      firstRefresh.current = false;
      return;
    }
    dirCache.clear();
    load(current, { silent: true });
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const items = useMemo(() => (raw ? sortItems(raw, settings.sortBy, settings.sortDir) : []), [raw, settings.sortBy, settings.sortDir]);

  // Scroll to a highlighted file ("Show in folder")
  useEffect(() => {
    if (!highlight || !items.length) return;
    const idx = items.findIndex((i) => i.path === highlight);
    if (idx >= 0 && !grid) {
      setTimeout(() => listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.4, animated: true }), 250);
    }
    const tm = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(tm);
  }, [highlight, items, grid]);

  const goTo = useCallback(
    (path) => {
      setSelected(new Set());
      setPaths((p) => [...p, path]);
      onNavigate();
    },
    []
  );

  const goBack = useCallback(() => {
    if (selecting) {
      setSelected(new Set());
      return true;
    }
    if (paths.length > 1) {
      setPaths((p) => p.slice(0, -1));
      return true;
    }
    nav.pop();
    return true;
  }, [selecting, paths.length, nav]);

  useBackHandler(goBack);

  // Restore scroll position when going back
  useEffect(() => {
    const off = offsets.current.get(current) || 0;
    if (raw && listRef.current) {
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: off, animated: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, grid, raw === null]);

  const toggleSelect = useCallback((item) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.path)) next.delete(item.path);
      else next.add(item.path);
      return next;
    });
  }, []);

  const onPress = useCallback(
    (item) => {
      if (selected.size > 0) {
        toggleSelect(item);
        return;
      }
      if (item.isDir) goTo(item.path);
      else actions.openItem(item, items);
    },
    [selected.size, toggleSelect, goTo, actions, items]
  );

  const onLongPress = useCallback(
    (item) => {
      actions.haptic();
      toggleSelect(item);
    },
    [actions, toggleSelect]
  );

  const onMore = useCallback((item) => actions.showMore(item, { onSelect: toggleSelect }), [actions, toggleSelect]);

  const selectedItems = useMemo(() => items.filter((i) => selected.has(i.path)), [items, selected]);

  const createNew = async (kind) => {
    const name = await ui.prompt({
      title: kind === 'folder' ? 'New folder' : 'New file',
      initial: kind === 'folder' ? 'New folder' : 'New file.txt',
      confirmText: 'Create',
    });
    if (!name) return;
    try {
      if (kind === 'folder') await FS.mkdir(current, name);
      else await FS.createFile(current, name);
      dirCache.delete(current);
      load(current, { silent: true });
      ui.toast(kind === 'folder' ? 'Folder created' : 'File created');
    } catch (e) {
      ui.alert('Could not create', e?.message);
    }
  };

  const showSort = () =>
    ui.sheet({
      title: 'Sort & view',
      actions: [
        ...SORTS.map((s) => ({
          label: s.label,
          icon: s.icon,
          checked: settings.sortBy === s.key,
          right: settings.sortBy === s.key ? (settings.sortDir === 'asc' ? 'Ascending' : 'Descending') : null,
          onPress: () => update(settings.sortBy === s.key ? { sortDir: settings.sortDir === 'asc' ? 'desc' : 'asc' } : { sortBy: s.key, sortDir: s.key === 'name' || s.key === 'type' ? 'asc' : 'desc' }),
        })),
        {
          label: grid ? 'List view' : 'Grid view',
          icon: grid ? 'view-list' : 'view-grid',
          onPress: () => update({ viewMode: grid ? 'list' : 'grid' }),
        },
      ],
    });

  const isFav = settings.favorites.includes(current);
  const showMenu = () =>
    ui.sheet({
      title: nameOf(current) || 'Internal storage',
      actions: [
        { label: 'New folder', icon: 'folder-plus-outline', onPress: () => createNew('folder') },
        { label: 'New file', icon: 'file-plus-outline', onPress: () => createNew('file') },
        items.length ? { label: 'Select all', icon: 'checkbox-multiple-marked-outline', onPress: () => setSelected(new Set(items.map((i) => i.path))) } : null,
        {
          label: settings.showHidden ? 'Hide hidden files' : 'Show hidden files',
          icon: settings.showHidden ? 'eye-off-outline' : 'eye-outline',
          onPress: () => {
            dirCache.clear();
            update({ showHidden: !settings.showHidden });
          },
        },
        {
          label: isFav ? 'Remove from favorites' : 'Add to favorites',
          icon: isFav ? 'star-off-outline' : 'star-outline',
          onPress: () => {
            toggleFavorite(current);
            ui.toast(isFav ? 'Removed from favorites' : 'Added to favorites');
          },
        },
        { label: 'Refresh', icon: 'refresh', onPress: () => load(current) },
      ],
    });

  // Breadcrumbs
  const crumbs = useMemo(() => {
    const rel = current.startsWith(FS.ROOT) ? current.slice(FS.ROOT.length) : current;
    const parts = rel.split('/').filter(Boolean);
    const out = [{ label: 'Internal', path: FS.ROOT }];
    let acc = FS.ROOT;
    parts.forEach((p) => {
      acc += '/' + p;
      out.push({ label: p, path: acc });
    });
    return out;
  }, [current]);
  const crumbRef = useRef(null);

  const jumpTo = (path) => {
    if (path === current) return;
    setSelected(new Set());
    const idx = paths.indexOf(path);
    if (idx >= 0) setPaths(paths.slice(0, idx + 1));
    else setPaths([...paths, path]);
  };

  const favSet = useMemo(() => new Set(settings.favorites), [settings.favorites]);

  const renderRow = useCallback(
    ({ item }) => (
      <FileRow
        item={item}
        selected={selected.has(item.path) || highlight === item.path}
        selecting={selecting}
        favorite={item.isDir && favSet.has(item.path)}
        onPress={onPress}
        onLongPress={onLongPress}
        onMore={onMore}
      />
    ),
    [selected, highlight, selecting, favSet, onPress, onLongPress, onMore]
  );

  const renderCell = useCallback(
    ({ item }) => (
      <FileGridCell item={item} size={cellSize} selected={selected.has(item.path)} selecting={selecting} onPress={onPress} onLongPress={onLongPress} />
    ),
    [cellSize, selected, selecting, onPress, onLongPress]
  );

  const title = selecting ? `${selected.size} selected` : nameOf(current) && current !== FS.ROOT ? nameOf(current) : 'Internal storage';
  const subtitle = selecting ? null : raw ? `${items.length} ${items.length === 1 ? 'item' : 'items'}` : 'Loading…';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <GradientHeader
        title={title}
        subtitle={subtitle}
        left={<IconButton name={selecting ? 'close' : 'arrow-left'} color="#fff" onPress={goBack} />}
        right={
          selecting ? (
            <IconButton
              name="checkbox-multiple-marked-outline"
              color="#fff"
              onPress={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((i) => i.path)))}
            />
          ) : (
            <View style={{ flexDirection: 'row' }}>
              <IconButton name="magnify" color="#fff" onPress={() => nav.push('search', { base: current })} />
              <IconButton name="sort" color="#fff" onPress={showSort} />
              <IconButton name="dots-vertical" color="#fff" onPress={showMenu} />
            </View>
          )
        }
      >
        <ScrollView
          ref={crumbRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => crumbRef.current?.scrollToEnd({ animated: false })}
          contentContainerStyle={styles.crumbs}
        >
          {crumbs.map((c, i) => (
            <View key={c.path} style={styles.crumbWrap}>
              {i > 0 ? <Icon name="chevron-right" size={16} color="rgba(255,255,255,0.6)" /> : null}
              <Pressable onPress={() => jumpTo(c.path)} hitSlop={6}>
                <Text style={[styles.crumb, i === crumbs.length - 1 && styles.crumbActive]} numberOfLines={1}>
                  {c.label}
                </Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </GradientHeader>

      <View style={{ flex: 1 }}>
        {raw === null ? (
          <ActivityIndicator color={t.brand} style={{ marginTop: 40 }} />
        ) : error ? (
          <EmptyState icon="folder-alert-outline" title="Can’t open this folder" message={error} />
        ) : (
          <FlatList
            key={grid ? `g${columns}` : 'list'}
            ref={listRef}
            data={items}
            numColumns={grid ? columns : 1}
            keyExtractor={(i) => i.path}
            renderItem={grid ? renderCell : renderRow}
            getItemLayout={grid ? undefined : (_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
            contentContainerStyle={[{ paddingBottom: 110 }, grid && { paddingHorizontal: 8, paddingTop: 6 }]}
            initialNumToRender={16}
            maxToRenderPerBatch={16}
            windowSize={11}
            removeClippedSubviews
            onScroll={(e) => offsets.current.set(current, e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={64}
            onScrollToIndexFailed={() => {}}
            refreshControl={<RefreshControl refreshing={loading && raw !== null} onRefresh={() => load(current)} colors={[t.brand]} progressBackgroundColor={t.card} />}
            ListEmptyComponent={
              <EmptyState
                icon="folder-open-outline"
                title="This folder is empty"
                message={clipboard ? 'Tap Paste to put your items here.' : 'Tap + to create a folder or file.'}
              />
            }
          />
        )}

        {selecting ? (
          <View style={[styles.actionBar, { backgroundColor: t.card, borderTopColor: t.border }]}>
            <BarButton icon="content-copy" label="Copy" onPress={() => { actions.toClipboard(selectedItems, 'copy'); setSelected(new Set()); }} />
            <BarButton icon="folder-move-outline" label="Move" onPress={() => { actions.toClipboard(selectedItems, 'move'); setSelected(new Set()); }} />
            <BarButton icon="share-variant" label="Share" onPress={() => actions.shareItems(selectedItems)} />
            <BarButton icon="trash-can-outline" label="Delete" danger onPress={() => actions.deleteItems(selectedItems)} />
            <BarButton
              icon="dots-horizontal"
              label="More"
              onPress={() =>
                ui.sheet({
                  title: `${selectedItems.length} selected`,
                  actions: [
                    selectedItems.length === 1 && { label: 'Rename', icon: 'form-textbox', onPress: () => actions.renameItem(selectedItems[0]) },
                    { label: 'Compress (ZIP)', icon: 'zip-box-outline', onPress: () => actions.compress(selectedItems) },
                    selectedItems.length === 1 && { label: 'Details', icon: 'information-outline', onPress: () => actions.showDetails(selectedItems[0]) },
                    { label: 'Delete permanently', icon: 'delete-forever', destructive: true, onPress: () => actions.deleteItems(selectedItems, { permanent: true }) },
                  ],
                })
              }
            />
          </View>
        ) : clipboard ? (
          <View style={[styles.pasteBar, { backgroundColor: t.card, borderTopColor: t.border }]}>
            <Icon name={clipboard.mode === 'move' ? 'folder-move' : 'content-copy'} size={22} color={t.brand} />
            <Text style={[styles.pasteText, { color: t.text }]} numberOfLines={1}>
              {clipboard.items.length} {clipboard.items.length === 1 ? 'item' : 'items'} to {clipboard.mode}
            </Text>
            <Pressable onPress={() => setClipboard(null)} style={styles.pasteBtnGhost}>
              <Text style={{ color: t.sub, fontWeight: '700' }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => actions.paste(current)} style={[styles.pasteBtn, { backgroundColor: t.brand }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Paste here</Text>
            </Pressable>
          </View>
        ) : (
          <Fab
            onPress={() =>
              ui.sheet({
                title: 'Create',
                actions: [
                  { label: 'New folder', icon: 'folder-plus-outline', onPress: () => createNew('folder') },
                  { label: 'New text file', icon: 'file-plus-outline', onPress: () => createNew('file') },
                ],
              })
            }
          />
        )}
      </View>
      {focused ? <BannerSlot /> : null}
    </View>
  );
}

function BarButton({ icon, label, onPress, danger }) {
  const t = useTheme();
  const color = danger ? t.danger : t.text;
  return (
    <Pressable onPress={onPress} style={styles.barBtn} android_ripple={{ color: t.selected, borderless: true }}>
      <Icon name={icon} size={22} color={color} />
      <Text style={[styles.barLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  crumbs: { paddingHorizontal: 14, paddingBottom: 12, alignItems: 'center' },
  crumbWrap: { flexDirection: 'row', alignItems: 'center' },
  crumb: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600', paddingHorizontal: 4, maxWidth: 160 },
  crumbActive: { color: '#fff' },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 8,
  },
  barBtn: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  barLabel: { fontSize: 11, marginTop: 3, fontWeight: '600' },
  pasteBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 8,
  },
  pasteText: { flex: 1, marginLeft: 10, fontSize: 14, fontWeight: '600' },
  pasteBtnGhost: { paddingHorizontal: 12, paddingVertical: 10 },
  pasteBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
});
