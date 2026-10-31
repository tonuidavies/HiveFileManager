import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, GradientHeader, Icon, IconButton, PrimaryButton } from '../components/UI';
import { FileIcon } from '../components/FileItems';
import NativeAdCard from '../ads/NativeAdCard';
import BannerSlot from '../ads/BannerSlot';
import { onTaskCompleted } from '../ads/AdManager';
import { radius, useTheme } from '../theme';
import { useBackHandler, useNav, useScreen } from '../navigation';
import { useStore } from '../state/store';
import { useUI } from '../components/Overlays';
import { useFileActions } from '../state/useFileActions';
import { moveToTrash } from '../state/trash';
import * as FS from '../native/HiveStorage';
import { SCOPES, autoSelect, duplicatesAvailable, findDuplicates, isCancelled, reclaimable } from '../utils/duplicates';
import { displayPath, formatBytes, formatDate, parentOf } from '../utils/files';
import { useT } from '../i18n';

const DEFAULT_SCOPES = ['photos', 'videos', 'audio', 'docs'];

export default function DuplicatesScreen() {
  const t = useTheme();
  const tx = useT();
  const nav = useNav();
  const ui = useUI();
  const { focused } = useScreen();
  const { settings, bumpRefresh } = useStore();
  const actions = useFileActions();

  const [stage, setStage] = useState('idle'); // idle | scanning | results | done
  const [scopes, setScopes] = useState(() => new Set(DEFAULT_SCOPES));
  const [progress, setProgress] = useState({ phase: 'list', done: 0, total: 0 });
  const [sets, setSets] = useState([]);
  const [selected, setSelected] = useState(() => new Set()); // paths that will be deleted
  const [freed, setFreed] = useState(0);
  const cancelRef = useRef(false);
  const spin = useRef(new Animated.Value(0)).current;

  const goBack = useCallback(() => {
    if (stage === 'scanning') {
      cancelRef.current = true;
      return true;
    }
    nav.pop();
    return true;
  }, [stage, nav]);
  useBackHandler(goBack);

  useEffect(() => () => {
    cancelRef.current = true;
  }, []);

  useEffect(() => {
    if (stage !== 'scanning') return undefined;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => {
      loop.stop();
      spin.setValue(0);
    };
  }, [stage, spin]);

  const toggleScope = (key) =>
    setScopes((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const scan = async () => {
    if (!duplicatesAvailable) {
      ui.alert(tx('dup_title'), tx('dup_needs_update'));
      return;
    }
    const categories = SCOPES.filter((s) => scopes.has(s.key)).flatMap((s) => s.categories);
    if (!categories.length) return;
    cancelRef.current = false;
    setProgress({ phase: 'list', done: 0, total: 0 });
    setStage('scanning');
    try {
      const found = await findDuplicates({
        categories,
        onProgress: (p) => !cancelRef.current && setProgress(p),
        shouldCancel: () => cancelRef.current,
      });
      setSets(found);
      setSelected(autoSelect(found, 'oldest'));
      setStage('results');
    } catch (e) {
      if (!isCancelled(e)) ui.toast(tx('dup_scan_failed'));
      setStage('idle');
    }
  };

  // ---- selection (always keep at least one copy per set)
  const toggleFile = useCallback(
    (set, file) => {
      if (!selected.has(file.path)) {
        const remaining = set.files.filter((f) => f.path !== file.path && !selected.has(f.path)).length;
        if (remaining === 0) {
          ui.toast(tx('dup_keep_one'));
          return;
        }
      }
      setSelected((prev) => {
        const n = new Set(prev);
        if (n.has(file.path)) n.delete(file.path);
        else n.add(file.path);
        return n;
      });
    },
    [selected, ui, tx]
  );

  const showSelectionMenu = () =>
    ui.sheet({
      title: tx('dup_options'),
      actions: [
        { label: tx('dup_auto_oldest'), icon: 'sort-calendar-ascending', onPress: () => setSelected(autoSelect(sets, 'oldest')) },
        { label: tx('dup_auto_newest'), icon: 'sort-calendar-descending', onPress: () => setSelected(autoSelect(sets, 'newest')) },
        { label: tx('dup_clear_selection'), icon: 'close-circle-outline', onPress: () => setSelected(new Set()) },
      ],
    });

  const selectedFiles = useMemo(() => {
    const out = [];
    sets.forEach((s) => s.files.forEach((f) => selected.has(f.path) && out.push(f)));
    return out;
  }, [sets, selected]);
  const selectedSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
  const totalReclaimable = useMemo(() => reclaimable(sets), [sets]);

  const clean = async () => {
    if (!selectedFiles.length) return;
    const toTrash = settings.useTrash;
    const items = tx('items', { count: selectedFiles.length });
    const ok = await ui.confirm({
      title: toTrash ? tx('dup_confirm_trash', { items }) : tx('dup_confirm_delete', { items }),
      message: `${tx('dup_confirm_msg', { size: formatBytes(selectedSize) })}${toTrash ? `\n\n${tx('dup_in_trash_note')}` : ''}`,
      confirmText: toTrash ? tx('move_to_trash') : tx('delete'),
      destructive: true,
      icon: toTrash ? 'trash-can-outline' : 'delete-forever',
    });
    if (!ok) return;
    ui.progress(toTrash ? tx('moving_trash') : tx('deleting'));
    const failedPaths = new Set();
    if (toTrash) {
      // moveToTrash reports only a count, so move one by one to know which files really went
      for (const f of selectedFiles) {
        const r = await moveToTrash([f]);
        if (r.failed) failedPaths.add(f.path);
      }
    } else {
      for (const f of selectedFiles) {
        try {
          await FS.remove(f.path);
        } catch {
          failedPaths.add(f.path);
        }
      }
    }
    ui.progress(null);
    const removed = selectedFiles.filter((f) => !failedPaths.has(f.path));
    const removedPaths = new Set(removed.map((f) => f.path));
    const bytes = removed.reduce((sum, f) => sum + f.size, 0);
    setFreed((v) => v + bytes);
    const rest = sets
      .map((s) => ({ ...s, files: s.files.filter((f) => !removedPaths.has(f.path)) }))
      .filter((s) => s.files.length > 1);
    setSets(rest);
    setSelected((prev) => new Set([...prev].filter((p) => !removedPaths.has(p))));
    bumpRefresh();
    onTaskCompleted();
    if (failedPaths.size) ui.toast(tx('n_deleted_failed', { done: removed.length, failed: failedPaths.size }));
    if (!rest.length) setStage('done');
  };

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const phaseText =
    progress.phase === 'list'
      ? tx('dup_phase_list')
      : progress.phase === 'size'
        ? tx('dup_phase_size')
        : tx('dup_phase_hash', { done: progress.done, total: progress.total });
  const pct = progress.phase === 'hash' && progress.total ? Math.min(1, progress.done / progress.total) : 0;

  const subtitle =
    stage === 'results'
      ? tx('dup_summary', { sets: tx('dup_sets', { count: sets.length }), size: formatBytes(totalReclaimable) })
      : stage === 'scanning'
        ? tx('scanning')
        : null;

  const renderSet = useCallback(
    ({ item: set }) => (
      <View style={[styles.set, { backgroundColor: t.card }]}>
        <View style={styles.setHead}>
          <Text style={[styles.setTitle, { color: t.text }]}>{tx('dup_copies', { count: set.files.length })}</Text>
          <Text style={[styles.setSub, { color: t.sub }]}>{tx('dup_each', { size: formatBytes(set.size) })}</Text>
        </View>
        {set.files.map((f) => {
          const del = selected.has(f.path);
          return (
            <Pressable
              key={f.path}
              onPress={() => toggleFile(set, f)}
              android_ripple={{ color: t.selected }}
              style={[styles.file, { borderTopColor: t.border }, del && { backgroundColor: t.selected }]}
            >
              <Pressable onPress={() => actions.openItem(f, set.files)} hitSlop={4}>
                <FileIcon item={f} size={52} rounded={12} />
              </Pressable>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.fileName, { color: t.text }]} numberOfLines={1}>
                  {f.name}
                </Text>
                <Text style={[styles.fileMeta, { color: t.sub }]} numberOfLines={1}>
                  {displayPath(parentOf(f.path), FS.ROOT)}
                </Text>
                <Text style={[styles.fileMeta, { color: t.faint }]} numberOfLines={1}>
                  {formatDate(f.mtime)}
                </Text>
              </View>
              {del ? (
                <Icon name="check-circle" size={24} color={t.danger} />
              ) : (
                <View style={[styles.keep, { backgroundColor: t.success + '22' }]}>
                  <Text style={[styles.keepText, { color: t.success }]}>{tx('dup_keep')}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    ),
    [selected, t, tx, toggleFile, actions]
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <GradientHeader
        title={tx('dup_title')}
        subtitle={subtitle}
        left={<IconButton name="arrow-left" color="#fff" onPress={goBack} />}
        right={stage === 'results' ? <IconButton name="tune-variant" color="#fff" onPress={showSelectionMenu} /> : null}
      >
        {stage === 'done' ? (
          <View style={styles.hero}>
            <Icon name="check-decagram" size={60} color="#fff" />
            <Text style={styles.heroBig}>{tx('dup_done', { size: formatBytes(freed) })}</Text>
            <Text style={styles.heroSub}>{tx('dup_done_sub')}</Text>
          </View>
        ) : null}
        {stage === 'scanning' ? (
          <View style={styles.hero}>
            <Animated.View style={{ transform: [{ rotate }] }}>
              <Icon name="loading" size={52} color="#fff" />
            </Animated.View>
            <Text style={styles.heroSub}>{phaseText}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(4, pct * 100)}%` }]} />
            </View>
          </View>
        ) : null}
      </GradientHeader>

      {stage === 'idle' ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          <Text style={[styles.sectionLabel, { color: t.text }]}>{tx('dup_choose')}</Text>
          <View style={styles.chips}>
            {SCOPES.map((s) => {
              const on = scopes.has(s.key);
              return (
                <Pressable
                  key={s.key}
                  onPress={() => toggleScope(s.key)}
                  style={[styles.chip, { backgroundColor: on ? s.color + '22' : t.card, borderColor: on ? s.color : t.border }]}
                >
                  <Icon name={s.icon} size={18} color={on ? s.color : t.sub} />
                  <Text style={[styles.chipText, { color: on ? s.color : t.text }]}>{tx(s.labelKey)}</Text>
                  {on ? <Icon name="check" size={16} color={s.color} /> : null}
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.note, { backgroundColor: t.card, borderColor: t.border }]}>
            <Icon name="information-outline" size={18} color={t.brand} />
            <Text style={[styles.noteText, { color: t.sub }]}>
              {tx('dup_scanned_hint')} {settings.useTrash ? tx('dup_in_trash_note') : ''}
            </Text>
          </View>
          <PrimaryButton title={tx('dup_scan')} icon="magnify-scan" disabled={!scopes.size} onPress={scan} style={{ marginTop: 20 }} />
          <NativeAdCard style={{ marginTop: 18 }} />
        </ScrollView>
      ) : null}

      {stage === 'scanning' ? (
        <View style={{ flex: 1, padding: 16 }}>
          <PrimaryButton title={tx('dup_cancel')} icon="close" onPress={() => (cancelRef.current = true)} style={{ marginTop: 12 }} />
        </View>
      ) : null}

      {stage === 'results' ? (
        <>
          <FlatList
            style={{ flex: 1 }}
            data={sets}
            keyExtractor={(s) => s.id}
            renderItem={renderSet}
            contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={7}
            ListEmptyComponent={<EmptyState icon="check-circle-outline" title={tx('dup_none')} message={tx('dup_none_msg')} />}
          />
          <View style={[styles.footer, { backgroundColor: t.bg, borderTopColor: t.border }]}>
            <PrimaryButton
              title={selectedFiles.length ? tx('dup_delete_btn', { size: formatBytes(selectedSize) }) : tx('nothing_selected')}
              icon="delete-sweep"
              danger
              disabled={!selectedFiles.length}
              onPress={clean}
            />
            {selectedFiles.length ? (
              <Text style={[styles.footerNote, { color: t.sub }]}>{tx('dup_selected', { items: tx('items', { count: selectedFiles.length }), size: formatBytes(selectedSize) })}</Text>
            ) : null}
          </View>
        </>
      ) : null}

      {stage === 'done' ? (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <PrimaryButton title={tx('scan_again')} icon="refresh" onPress={() => { setFreed(0); setStage('idle'); }} />
          <NativeAdCard style={{ marginTop: 18 }} />
        </ScrollView>
      ) : null}

      {focused ? <BannerSlot /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 24 },
  heroBig: { color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 6 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 8, textAlign: 'center' },
  progressTrack: { alignSelf: 'stretch', height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 14, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: '#fff' },
  sectionLabel: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 40, borderRadius: 20, borderWidth: 1.5, marginRight: 8, marginBottom: 10 },
  chipText: { marginHorizontal: 8, fontSize: 14, fontWeight: '600' },
  note: { flexDirection: 'row', borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, marginTop: 6 },
  noteText: { flex: 1, marginLeft: 10, fontSize: 13, lineHeight: 19 },
  set: { borderRadius: radius.lg, marginBottom: 12, overflow: 'hidden' },
  setHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  setTitle: { fontSize: 15, fontWeight: '700' },
  setSub: { fontSize: 12 },
  file: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  fileName: { fontSize: 14, fontWeight: '600' },
  fileMeta: { fontSize: 11, marginTop: 2 },
  keep: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  keepText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth },
  footerNote: { textAlign: 'center', fontSize: 12, marginTop: 6 },
});
