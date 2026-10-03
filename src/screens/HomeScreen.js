import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GradientHeader, Icon, IconButton, SectionTitle } from '../components/UI';
import { FileIcon } from '../components/FileItems';
import BannerSlot from '../ads/BannerSlot';
import { useAdState } from '../ads/useAds';
import { useAdFreeFlow } from '../ads/useAdFree';
import { useTheme } from '../theme';
import { useNav, useScreen } from '../navigation';
import { useStore } from '../state/store';
import { useUI } from '../components/Overlays';
import { useFileActions } from '../state/useFileActions';
import * as FS from '../native/HiveStorage';
import { CATEGORIES, formatBytes, nameOf } from '../utils/files';

let cachedSummary = null; // instant render on next visit

const QUICK = [
  { label: 'Internal', icon: 'cellphone', path: '' },
  { label: 'Downloads', icon: 'download', path: '/Download' },
  { label: 'Camera', icon: 'camera', path: '/DCIM/Camera' },
  { label: 'Screenshots', icon: 'cellphone-screenshot', path: '/Pictures/Screenshots' },
  { label: 'Documents', icon: 'file-document', path: '/Documents' },
  { label: 'WhatsApp', icon: 'whatsapp', path: '/Android/media/com.whatsapp/WhatsApp/Media' },
  { label: 'Music', icon: 'music', path: '/Music' },
  { label: 'Movies', icon: 'movie-open', path: '/Movies' },
];

export default function HomeScreen() {
  const t = useTheme();
  const nav = useNav();
  const ui = useUI();
  const { focused } = useScreen();
  const { settings, refreshToken } = useStore();
  const actions = useFileActions();
  const { adFree, ready: adsReady } = useAdState();
  const [storage, setStorage] = useState(() => FS.storageInfo());
  const [summary, setSummary] = useState(cachedSummary);
  const [refreshing, setRefreshing] = useState(false);
  const [quick, setQuick] = useState(QUICK.slice(0, 5));
  const lastLoad = useRef(0);
  // Fit-to-screen: the "Recent files" strip only shows if it fits without scrolling
  const [viewH, setViewH] = useState(0);
  const [baseH, setBaseH] = useState(0);

  const load = useCallback(async (force) => {
    if (!force && Date.now() - lastLoad.current < 4000) return;
    lastLoad.current = Date.now();
    setStorage(FS.storageInfo());
    try {
      const s = await FS.scanSummary(20);
      cachedSummary = s;
      setSummary(s);
    } catch {}
  }, []);

  // Refresh when coming back to Home; always refresh after files were changed
  const seenToken = useRef(refreshToken);
  useEffect(() => {
    if (!focused) return;
    const changed = seenToken.current !== refreshToken;
    seenToken.current = refreshToken;
    load(changed);
  }, [focused, refreshToken, load]);

  useEffect(() => {
    (async () => {
      const found = [];
      for (const q of QUICK) {
        try {
          await FS.listDir(FS.ROOT + q.path, false);
          found.push(q);
        } catch {}
      }
      setQuick(found);
    })();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  const usedPct = storage.total ? Math.min(1, storage.used / storage.total) : 0;
  const cats = summary?.categories || {};
  const recent = summary?.recent || [];

  const askAdFree = useAdFreeFlow();

  const showFavorites = () => {
    if (!settings.favorites.length) {
      ui.toast('No favorites yet. Open a folder, tap ⋮ and choose "Add to favorites".');
      return;
    }
    ui.sheet({
      title: 'Favorites',
      actions: settings.favorites.slice(0, 12).map((p) => ({
        label: nameOf(p) || 'Internal storage',
        icon: 'star',
        onPress: () => nav.push('browser', { path: p }),
      })),
    });
  };

  const adAvailable = adsReady && !adFree;
  const RECENT_H = 150;
  const showRecent = recent.length > 0 && viewH > 0 && baseH > 0 && viewH - baseH >= RECENT_H;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
        contentContainerStyle={{ paddingBottom: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[t.brand]} progressBackgroundColor={t.card} />}
        showsVerticalScrollIndicator={false}
      >
        <View onLayout={(e) => setBaseH(e.nativeEvent.layout.height)}>
        <GradientHeader
          compact
          title="Hive Files"
          left={
            <View style={styles.brandMark}>
              <Icon name="hexagon-multiple" size={24} color="#fff" />
            </View>
          }
          right={
            <View style={{ flexDirection: 'row' }}>
              {adAvailable ? <IconButton name="gift-outline" color="#fff" onPress={askAdFree} /> : null}
              <IconButton name="magnify" color="#fff" onPress={() => nav.push('search', {})} />
              <IconButton name="cog-outline" color="#fff" onPress={() => nav.push('settings', {})} />
            </View>
          }
        >
          <Pressable style={styles.storageCard} onPress={() => nav.push('browser', { path: FS.ROOT })}>
            <View style={styles.storageTop}>
              <View style={styles.storageIcon}>
                <Icon name="cellphone" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.storageTitle}>Internal storage</Text>
                <Text style={styles.storageSub}>
                  {formatBytes(storage.used)} used of {formatBytes(storage.total)}
                </Text>
              </View>
              <Text style={styles.storagePct}>{Math.round(usedPct * 100)}%</Text>
            </View>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${Math.max(3, usedPct * 100)}%` }]} />
            </View>
            <View style={styles.storageBottom}>
              <Text style={styles.storageFree}>{formatBytes(storage.free)} free</Text>
              <Pressable style={styles.cleanPill} onPress={() => nav.push('cleaner', {})} hitSlop={6}>
                <Icon name="broom" size={14} color={t.brand} />
                <Text style={[styles.cleanText, { color: t.brand }]}>Clean up</Text>
              </Pressable>
            </View>
          </Pressable>
        </GradientHeader>

        {/* Categories (2 rows) */}
        <SectionTitle compact title="Categories" />
        <View style={styles.grid}>
          {CATEGORIES.map((c) => {
            const info = cats[c.key];
            return (
              <Pressable
                key={c.key}
                style={({ pressed }) => [styles.catTile, pressed && { opacity: 0.7 }]}
                onPress={() => (c.key === 'downloads' ? nav.push('browser', { path: FS.ROOT + '/Download' }) : nav.push('category', { category: c.key }))}
              >
                <View style={[styles.catIcon, { backgroundColor: c.color + '1F' }]}>
                  <Icon name={c.icon} size={24} color={c.color} />
                </View>
                <Text style={[styles.catLabel, { color: t.text }]} numberOfLines={1}>
                  {c.label}
                </Text>
                <Text style={[styles.catMeta, { color: t.sub }]} numberOfLines={1}>
                  {info ? formatBytes(info.size, 0) : c.key === 'large' ? '50 MB+' : '…'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Quick access */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ marginTop: 6 }}>
          {quick.map((q) => (
            <Pressable
              key={q.label}
              onPress={() => nav.push('browser', { path: FS.ROOT + q.path })}
              style={[styles.chip, { backgroundColor: t.card, borderColor: t.border }]}
            >
              <Icon name={q.icon} size={16} color={t.brand} />
              <Text style={[styles.chipText, { color: t.text }]}>{q.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Tools: one row */}
        <View style={styles.tools}>
          <Tool icon="broom" color="#10B981" label="Cleaner" onPress={() => nav.push('cleaner', {})} />
          <Tool icon="trash-can-outline" color="#64748B" label="Trash" onPress={() => nav.push('trash', {})} />
          <Tool icon="star-outline" color="#F5B83D" label="Favorites" onPress={showFavorites} />
          <Tool icon="clock-outline" color={t.brand} label="Recent" onPress={() => nav.push('category', { category: 'recent' })} />
        </View>

        </View>

        {/* Recent files */}
        {showRecent ? (
          <>
            <SectionTitle compact title="Recent files" action="See all" onAction={() => nav.push('category', { category: 'recent' })} />
            <FlatList
              horizontal
              data={recent}
              keyExtractor={(i) => i.path}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12 }}
              initialNumToRender={5}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => actions.openItem(item, recent)}
                  onLongPress={() => actions.showMore(item, { showInFolder: true })}
                  style={[styles.recent, { backgroundColor: t.card }]}
                >
                  <FileIcon item={item} size={76} rounded={12} />
                  <Text style={[styles.recentName, { color: t.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.recentMeta, { color: t.sub }]}>{formatBytes(item.size, 0)}</Text>
                </Pressable>
              )}
            />
          </>
        ) : null}

      </ScrollView>
      {focused ? <BannerSlot /> : null}
    </View>
  );
}

function Tool({ icon, color, label, onPress }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tool, { backgroundColor: t.card }, pressed && { opacity: 0.8 }]}>
      <Icon name={icon} size={22} color={color} />
      <Text style={[styles.toolText, { color: t.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  brandMark: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  storageCard: {
    marginHorizontal: 14,
    marginTop: 2,
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  storageTop: { flexDirection: 'row', alignItems: 'center' },
  storageIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  storageTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  storageSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 1 },
  storagePct: { color: '#fff', fontSize: 22, fontWeight: '800' },
  bar: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 8, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: '#fff' },
  storageBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  storageFree: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '600' },
  cleanPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16 },
  cleanText: { fontWeight: '700', fontSize: 12, marginLeft: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  catTile: { width: '25%', alignItems: 'center', paddingVertical: 4 },
  catIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  catLabel: { fontSize: 12, fontWeight: '600', marginTop: 5 },
  catMeta: { fontSize: 10, marginTop: 1 },
  chips: { paddingHorizontal: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 34, borderRadius: 17, marginHorizontal: 4, borderWidth: StyleSheet.hairlineWidth },
  chipText: { marginLeft: 6, fontSize: 13, fontWeight: '600' },
  tools: { flexDirection: 'row', paddingHorizontal: 12, marginTop: 10 },
  tool: { flex: 1, marginHorizontal: 4, borderRadius: 14, height: 56, alignItems: 'center', justifyContent: 'center' },
  toolText: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  recent: { width: 92, padding: 8, borderRadius: 16, marginHorizontal: 4 },
  recentName: { fontSize: 11, fontWeight: '600', marginTop: 6 },
  recentMeta: { fontSize: 10, marginTop: 1 },
});
