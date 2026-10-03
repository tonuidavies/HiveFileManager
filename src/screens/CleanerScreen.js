import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GradientHeader, Icon, IconButton, PrimaryButton } from '../components/UI';
import { FileIcon } from '../components/FileItems';
import NativeAdCard from '../ads/NativeAdCard';
import BannerSlot from '../ads/BannerSlot';
import { onTaskCompleted } from '../ads/AdManager';
import { radius, useTheme } from '../theme';
import { useBackHandler, useNav, useScreen } from '../navigation';
import { useStore } from '../state/store';
import { useUI } from '../components/Overlays';
import * as FS from '../native/HiveStorage';
import { formatBytes } from '../utils/files';

const GROUPS = [
  { key: 'junk', title: 'Junk & temporary files', icon: 'delete-sweep', color: '#F97316', text: 'Temp files, logs, thumbnail cache and empty files', preselect: true },
  { key: 'empty', title: 'Empty folders', icon: 'folder-remove-outline', color: '#EAB308', text: 'Folders with nothing inside', preselect: true },
  { key: 'apks', title: 'APK installers', icon: 'android', color: '#10B981', text: 'Install files you probably no longer need', preselect: false },
  { key: 'large', title: 'Large files (100 MB+)', icon: 'database', color: '#EF4444', text: 'Review before deleting', preselect: false },
];

export default function CleanerScreen() {
  const t = useTheme();
  const nav = useNav();
  const ui = useUI();
  const { focused } = useScreen();
  const { bumpRefresh } = useStore();
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [open, setOpen] = useState({});
  const [freed, setFreed] = useState(null);
  const spin = useRef(new Animated.Value(0)).current;

  useBackHandler(() => {
    nav.pop();
    return true;
  });

  const scan = async () => {
    setResult(null);
    setFreed(null);
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    try {
      const r = await FS.cleanerScan(100 * 1024 * 1024);
      const pre = new Set();
      GROUPS.forEach((g) => g.preselect && (r[g.key] || []).forEach((i) => pre.add(i.path)));
      setSelected(pre);
      setResult(r);
    } catch {
      setResult({ junk: [], empty: [], apks: [], large: [] });
    }
    loop.stop();
    spin.setValue(0);
  };

  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const all = useMemo(() => (result ? GROUPS.flatMap((g) => result[g.key] || []) : []), [result]);
  const selectedItems = useMemo(() => all.filter((i) => selected.has(i.path)), [all, selected]);
  const selectedSize = selectedItems.reduce((s, i) => s + (i.size || 0), 0);

  const toggleGroup = (g) => {
    const list = result[g.key] || [];
    const allOn = list.length && list.every((i) => selected.has(i.path));
    setSelected((prev) => {
      const n = new Set(prev);
      list.forEach((i) => (allOn ? n.delete(i.path) : n.add(i.path)));
      return n;
    });
  };

  const toggleOne = (item) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(item.path)) n.delete(item.path);
      else n.add(item.path);
      return n;
    });

  const clean = async () => {
    if (!selectedItems.length) return;
    const ok = await ui.confirm({
      title: `Clean ${formatBytes(selectedSize)}?`,
      message: `${selectedItems.length} selected items will be permanently deleted.`,
      confirmText: 'Clean now',
      destructive: true,
      icon: 'broom',
    });
    if (!ok) return;
    ui.progress('Cleaning…');
    let size = 0;
    for (const it of selectedItems) {
      try {
        await FS.remove(it.path);
        size += it.size || 0;
      } catch {}
    }
    ui.progress(null);
    bumpRefresh();
    setFreed(size);
    setResult(null);
    onTaskCompleted();
  };

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <GradientHeader title="Cleaner" left={<IconButton name="arrow-left" color="#fff" onPress={() => nav.pop()} />} right={<IconButton name="refresh" color="#fff" onPress={scan} />}>
        <View style={styles.hero}>
          {freed !== null ? (
            <>
              <Icon name="check-decagram" size={64} color="#fff" />
              <Text style={styles.heroBig}>{formatBytes(freed)}</Text>
              <Text style={styles.heroSub}>freed up. Your phone is cleaner!</Text>
            </>
          ) : result ? (
            <>
              <Text style={styles.heroBig}>{formatBytes(selectedSize)}</Text>
              <Text style={styles.heroSub}>selected to clean</Text>
            </>
          ) : (
            <>
              <Animated.View style={{ transform: [{ rotate }] }}>
                <Icon name="loading" size={56} color="#fff" />
              </Animated.View>
              <Text style={styles.heroSub}>Scanning your storage…</Text>
            </>
          )}
        </View>
      </GradientHeader>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {freed !== null ? (
          <>
            <PrimaryButton title="Scan again" icon="refresh" onPress={scan} />
            <NativeAdCard style={{ marginTop: 18 }} />
          </>
        ) : result ? (
          <>
            {GROUPS.map((g) => {
              const list = result[g.key] || [];
              const size = list.reduce((s, i) => s + (i.size || 0), 0);
              const on = list.filter((i) => selected.has(i.path)).length;
              const expanded = !!open[g.key];
              return (
                <View key={g.key} style={[styles.group, { backgroundColor: t.card }]}>
                  <Pressable style={styles.groupHead} onPress={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}>
                    <View style={[styles.gIcon, { backgroundColor: g.color + '1F' }]}>
                      <Icon name={g.icon} size={22} color={g.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.gTitle, { color: t.text }]}>{g.title}</Text>
                      <Text style={[styles.gText, { color: t.sub }]} numberOfLines={1}>
                        {list.length ? `${list.length} items · ${formatBytes(size)}` : 'Nothing found'}
                      </Text>
                    </View>
                    {list.length ? (
                      <Pressable onPress={() => toggleGroup(g)} hitSlop={10} style={{ padding: 4 }}>
                        <Icon
                          name={on === list.length ? 'checkbox-marked-circle' : on ? 'minus-circle' : 'checkbox-blank-circle-outline'}
                          size={24}
                          color={on ? t.brand : t.faint}
                        />
                      </Pressable>
                    ) : (
                      <Icon name="check-circle" size={24} color={t.success} />
                    )}
                  </Pressable>
                  {expanded && list.length
                    ? list.slice(0, 200).map((item) => (
                        <Pressable key={item.path} style={[styles.item, { borderTopColor: t.border }]} onPress={() => toggleOne(item)}>
                          <FileIcon item={item} size={36} rounded={10} />
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={[styles.itemName, { color: t.text }]} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={[styles.itemMeta, { color: t.sub }]} numberOfLines={1}>
                              {item.isDir ? 'Empty folder' : formatBytes(item.size)}
                            </Text>
                          </View>
                          <Icon name={selected.has(item.path) ? 'check-circle' : 'checkbox-blank-circle-outline'} size={22} color={selected.has(item.path) ? t.brand : t.faint} />
                        </Pressable>
                      ))
                    : null}
                  {list.length ? (
                    <Pressable onPress={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))} style={styles.expand}>
                      <Text style={{ color: t.brand, fontWeight: '700', fontSize: 13 }}>{expanded ? 'Hide items' : 'Review items'}</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            <NativeAdCard style={{ marginTop: 6 }} />
          </>
        ) : null}
      </ScrollView>

      {result && freed === null ? (
        <View style={[styles.footer, { backgroundColor: t.bg }]}>
          <PrimaryButton title={selectedItems.length ? `Clean ${formatBytes(selectedSize)}` : 'Nothing selected'} icon="broom" disabled={!selectedItems.length} onPress={clean} />
        </View>
      ) : null}
      {focused ? <BannerSlot /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 22 },
  heroBig: { color: '#fff', fontSize: 40, fontWeight: '800', marginTop: 6 },
  heroSub: { color: 'rgba(255,255,255,0.88)', fontSize: 14, marginTop: 6 },
  group: { borderRadius: radius.lg, marginBottom: 12, overflow: 'hidden' },
  groupHead: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  gIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  gTitle: { fontSize: 15, fontWeight: '700' },
  gText: { fontSize: 12, marginTop: 2 },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  itemName: { fontSize: 14, fontWeight: '500' },
  itemMeta: { fontSize: 12, marginTop: 2 },
  expand: { alignItems: 'center', paddingVertical: 10 },
  footer: { paddingHorizontal: 16, paddingVertical: 10 },
});
