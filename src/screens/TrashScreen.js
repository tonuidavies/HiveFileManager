import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState, GradientHeader, Icon, IconButton } from '../components/UI';
import { FileIcon } from '../components/FileItems';
import { useTheme } from '../theme';
import { useBackHandler, useNav, useScreen } from '../navigation';
import { useStore } from '../state/store';
import { useUI } from '../components/Overlays';
import { TRASH_KEEP_DAYS, deleteFromTrash, listTrash, restoreFromTrash } from '../state/trash';
import { formatBytes, formatDate } from '../utils/files';

const DAY = 24 * 60 * 60 * 1000;

export default function TrashScreen() {
  const t = useTheme();
  const nav = useNav();
  const ui = useUI();
  const { focused } = useScreen();
  const { bumpRefresh } = useStore();
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState(() => new Set());

  const load = useCallback(async () => setItems(await listTrash()), []);
  useEffect(() => {
    if (focused) load();
  }, [focused, load]);

  useBackHandler(() => {
    if (selected.size) setSelected(new Set());
    else nav.pop();
    return true;
  });

  const toggle = (e) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(e.id)) n.delete(e.id);
      else n.add(e.id);
      return n;
    });

  const targets = () => (selected.size ? items.filter((e) => selected.has(e.id)) : []);

  const restore = async (list) => {
    ui.progress('Restoring…');
    const { failed } = await restoreFromTrash(list);
    ui.progress(null);
    setSelected(new Set());
    bumpRefresh();
    load();
    ui.toast(failed ? `${list.length - failed} restored, ${failed} failed` : `${list.length} restored`);
  };

  const removeForever = async (list, all) => {
    const ok = await ui.confirm({
      title: all ? 'Empty Trash?' : `Delete ${list.length} forever?`,
      message: 'This cannot be undone.',
      confirmText: 'Delete',
      destructive: true,
      icon: 'delete-forever',
    });
    if (!ok) return;
    ui.progress('Deleting…');
    await deleteFromTrash(list);
    ui.progress(null);
    setSelected(new Set());
    load();
    ui.toast('Deleted');
  };

  const total = (items || []).reduce((s, e) => s + (e.size || 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <GradientHeader
        title={selected.size ? `${selected.size} selected` : 'Trash'}
        subtitle={items ? `${items.length} items · ${formatBytes(total)} · kept ${TRASH_KEEP_DAYS} days` : null}
        left={<IconButton name={selected.size ? 'close' : 'arrow-left'} color="#fff" onPress={() => (selected.size ? setSelected(new Set()) : nav.pop())} />}
        right={items && items.length ? <IconButton name="delete-sweep" color="#fff" onPress={() => removeForever(items, true)} /> : null}
      />
      {items === null ? (
        <ActivityIndicator color={t.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={<EmptyState icon="trash-can-outline" title="Trash is empty" message="Deleted files stay here for 30 days so you can restore them." />}
          renderItem={({ item: e }) => {
            const left = Math.max(0, Math.ceil((e.deletedAt + TRASH_KEEP_DAYS * DAY - Date.now()) / DAY));
            const sel = selected.has(e.id);
            return (
              <Pressable
                onPress={() => (selected.size ? toggle(e) : ui.sheet({
                  title: e.name,
                  subtitle: `Deleted ${formatDate(e.deletedAt)}`,
                  actions: [
                    { label: 'Restore', icon: 'restore', onPress: () => restore([e]) },
                    { label: 'Delete forever', icon: 'delete-forever', destructive: true, onPress: () => removeForever([e]) },
                  ],
                }))}
                onLongPress={() => toggle(e)}
                style={[styles.row, sel && { backgroundColor: t.selected }]}
              >
                <FileIcon item={{ name: e.name, path: e.trashPath, isDir: e.isDir, count: 1 }} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
                    {e.name}
                  </Text>
                  <Text style={[styles.meta, { color: t.sub }]} numberOfLines={1}>
                    {e.isDir ? 'Folder' : formatBytes(e.size)} · {left} {left === 1 ? 'day' : 'days'} left
                  </Text>
                </View>
                {selected.size ? <Icon name={sel ? 'check-circle' : 'checkbox-blank-circle-outline'} size={24} color={sel ? t.brand : t.faint} /> : null}
              </Pressable>
            );
          }}
        />
      )}
      {selected.size ? (
        <View style={[styles.bar, { backgroundColor: t.card, borderTopColor: t.border }]}>
          <Pressable style={styles.barBtn} onPress={() => restore(targets())}>
            <Icon name="restore" size={22} color={t.brand} />
            <Text style={[styles.barText, { color: t.brand }]}>Restore</Text>
          </Pressable>
          <Pressable style={styles.barBtn} onPress={() => removeForever(targets())}>
            <Icon name="delete-forever" size={22} color={t.danger} />
            <Text style={[styles.barText, { color: t.danger }]}>Delete forever</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 68 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 3 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, elevation: 8 },
  barBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  barText: { marginLeft: 8, fontWeight: '700', fontSize: 15 },
});
