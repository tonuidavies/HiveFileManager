import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { EmptyState, GradientHeader, Icon, IconButton } from '../components/UI';
import { FileGridCell, FileRow } from '../components/FileItems';
import BannerSlot from '../ads/BannerSlot';
import NativeAdCard from '../ads/NativeAdCard';
import { onNavigate } from '../ads/AdManager';
import { useTheme } from '../theme';
import { useBackHandler, useNav, useScreen } from '../navigation';
import { useStore } from '../state/store';
import { useUI } from '../components/Overlays';
import { useFileActions } from '../state/useFileActions';
import * as FS from '../native/HiveStorage';
import { categoryMeta, formatBytes } from '../utils/files';

const VISUAL = ['images', 'videos'];
const SORTS = [
  { key: 'date', label: 'Newest first', icon: 'calendar-clock' },
  { key: 'size', label: 'Largest first', icon: 'sort-numeric-descending' },
  { key: 'name', label: 'Name (A–Z)', icon: 'sort-alphabetical-ascending' },
];

export default function CategoryScreen({ params }) {
  const t = useTheme();
  const nav = useNav();
  const ui = useUI();
  const { focused } = useScreen();
  const { width } = useWindowDimensions();
  const { refreshToken } = useStore();
  const actions = useFileActions();
  const category = params.category;
  const meta = category === 'recent' ? { label: 'Recent files', color: t.brand } : categoryMeta(category);

  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [sortBy, setSortBy] = useState(category === 'large' ? 'size' : 'date');
  const [grid, setGrid] = useState(VISUAL.includes(category));
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await FS.queryCategory(category, category === 'recent' ? 200 : 5000);
      setData(res);
    } catch {
      setData([]);
    }
  }, [category]);

  useEffect(() => {
    load();
    onNavigate();
  }, [load]);

  useEffect(() => {
    if (data !== null) {
      load();
      setSelected(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const items = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const filtered = q ? data.filter((i) => i.name.toLowerCase().includes(q)) : data;
    const out = filtered.slice();
    if (sortBy === 'size') out.sort((a, b) => b.size - a.size);
    else if (sortBy === 'name') out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    else out.sort((a, b) => b.mtime - a.mtime);
    return out;
  }, [data, query, sortBy]);

  const totalSize = useMemo(() => items.reduce((s, i) => s + i.size, 0), [items]);
  const selecting = selected.size > 0;
  const selectedItems = useMemo(() => items.filter((i) => selected.has(i.path)), [items, selected]);

  const toggle = useCallback((item) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(item.path)) n.delete(item.path);
      else n.add(item.path);
      return n;
    });
  }, []);

  const onPress = useCallback((item) => (selected.size ? toggle(item) : actions.openItem(item, items)), [selected.size, toggle, actions, items]);
  const onLongPress = useCallback(
    (item) => {
      actions.haptic();
      toggle(item);
    },
    [actions, toggle]
  );
  const onMore = useCallback((item) => actions.showMore(item, { onSelect: toggle, showInFolder: true }), [actions, toggle]);

  const back = () => {
    if (selecting) setSelected(new Set());
    else if (searching) {
      setSearching(false);
      setQuery('');
    } else nav.pop();
    return true;
  };
  useBackHandler(back);

  const columns = width > 600 ? 5 : 3;
  const cellSize = Math.floor((width - 16) / columns);

  const renderRow = useCallback(
    ({ item }) => <FileRow item={item} selected={selected.has(item.path)} selecting={selecting} showPath={category === 'recent' || category === 'large'} onPress={onPress} onLongPress={onLongPress} onMore={onMore} />,
    [selected, selecting, onPress, onLongPress, onMore, category]
  );
  const renderCell = useCallback(
    ({ item }) => <FileGridCell item={item} size={cellSize} selected={selected.has(item.path)} selecting={selecting} onPress={onPress} onLongPress={onLongPress} />,
    [cellSize, selected, selecting, onPress, onLongPress]
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <GradientHeader
        title={selecting ? `${selected.size} selected` : meta.label}
        subtitle={selecting ? formatBytes(selectedItems.reduce((s, i) => s + i.size, 0)) : data ? `${items.length} files · ${formatBytes(totalSize)}` : 'Scanning…'}
        left={<IconButton name={selecting ? 'close' : 'arrow-left'} color="#fff" onPress={back} />}
        right={
          selecting ? (
            <IconButton
              name="checkbox-multiple-marked-outline"
              color="#fff"
              onPress={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((i) => i.path)))}
            />
          ) : (
            <View style={{ flexDirection: 'row' }}>
              <IconButton name="magnify" color="#fff" onPress={() => setSearching((s) => !s)} />
              <IconButton
                name="sort"
                color="#fff"
                onPress={() =>
                  ui.sheet({
                    title: 'Sort & view',
                    actions: [
                      ...SORTS.map((s) => ({ label: s.label, icon: s.icon, checked: sortBy === s.key, onPress: () => setSortBy(s.key) })),
                      { label: grid ? 'List view' : 'Grid view', icon: grid ? 'view-list' : 'view-grid', onPress: () => setGrid(!grid) },
                    ],
                  })
                }
              />
            </View>
          )
        }
      >
        {searching ? (
          <View style={styles.filter}>
            <Icon name="filter-variant" size={18} color="rgba(255,255,255,0.9)" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder={`Filter ${meta.label.toLowerCase()}`}
              placeholderTextColor="rgba(255,255,255,0.7)"
              style={styles.filterInput}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Icon name="close-circle" size={18} color="#fff" />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </GradientHeader>

      <View style={{ flex: 1 }}>
        {data === null ? (
          <ActivityIndicator color={t.brand} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            key={grid ? `g${columns}` : 'list'}
            data={items}
            numColumns={grid ? columns : 1}
            keyExtractor={(i) => i.path}
            renderItem={grid ? renderCell : renderRow}
            ListHeaderComponent={grid ? null : <NativeAdCard style={{ margin: 12 }} />}
            contentContainerStyle={[{ paddingBottom: 90 }, grid && { paddingHorizontal: 8, paddingTop: 6 }]}
            initialNumToRender={18}
            maxToRenderPerBatch={18}
            windowSize={9}
            removeClippedSubviews
            ListEmptyComponent={<EmptyState icon={meta.icon || 'file-search-outline'} title={query ? 'No matches' : `No ${meta.label.toLowerCase()} found`} />}
          />
        )}
        {selecting ? (
          <View style={[styles.actionBar, { backgroundColor: t.card, borderTopColor: t.border }]}>
            <Bar icon="share-variant" label="Share" onPress={() => actions.shareItems(selectedItems)} />
            <Bar icon="content-copy" label="Copy" onPress={() => { actions.toClipboard(selectedItems, 'copy'); setSelected(new Set()); nav.push('browser', { path: FS.ROOT }); }} />
            <Bar icon="folder-move-outline" label="Move" onPress={() => { actions.toClipboard(selectedItems, 'move'); setSelected(new Set()); nav.push('browser', { path: FS.ROOT }); }} />
            <Bar icon="zip-box-outline" label="Zip" onPress={() => actions.compress(selectedItems)} />
            <Bar icon="trash-can-outline" label="Delete" danger onPress={() => actions.deleteItems(selectedItems)} />
          </View>
        ) : null}
      </View>
      {focused ? <BannerSlot /> : null}
    </View>
  );
}

function Bar({ icon, label, onPress, danger }) {
  const t = useTheme();
  const color = danger ? t.danger : t.text;
  return (
    <Pressable onPress={onPress} style={styles.barBtn}>
      <Icon name={icon} size={22} color={color} />
      <Text style={[styles.barLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filter: {
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 42,
  },
  filterInput: { flex: 1, color: '#fff', marginLeft: 8, fontSize: 15, paddingVertical: 0 },
  actionBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, elevation: 8 },
  barBtn: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  barLabel: { fontSize: 11, marginTop: 3, fontWeight: '600' },
});
