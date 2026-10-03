import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { EmptyState, Icon, IconButton } from '../components/UI';
import { FileRow } from '../components/FileItems';
import { useTheme } from '../theme';
import { useBackHandler, useNav } from '../navigation';
import { useStore } from '../state/store';
import { useFileActions } from '../state/useFileActions';
import * as FS from '../native/HiveStorage';
import { nameOf } from '../utils/files';

const HISTORY_KEY = '@hive_search_history';

export default function SearchScreen({ params }) {
  const t = useTheme();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { settings } = useStore();
  const actions = useFileActions();
  const base = params.base || FS.ROOT;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const timer = useRef(null);
  const reqId = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY)
      .then((r) => r && setHistory(JSON.parse(r)))
      .catch(() => {});
    return () => {
      clearTimeout(timer.current);
      FS.cancelSearch();
    };
  }, []);

  const saveHistory = (q) => {
    const next = [q, ...history.filter((h) => h !== q)].slice(0, 8);
    setHistory(next);
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
  };

  const run = useCallback(
    async (q) => {
      const id = ++reqId.current;
      if (q.trim().length < 2) {
        FS.cancelSearch();
        setResults([]);
        setBusy(false);
        return;
      }
      setBusy(true);
      try {
        const r = await FS.search(base, q, settings.showHidden, 400);
        if (id === reqId.current) setResults(r.sort((a, b) => (a.isDir === b.isDir ? 0 : a.isDir ? -1 : 1)));
      } catch {
        if (id === reqId.current) setResults([]);
      }
      if (id === reqId.current) setBusy(false);
    },
    [base, settings.showHidden]
  );

  const onChange = (q) => {
    setQuery(q);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => run(q), 350);
  };

  useBackHandler(() => {
    nav.pop();
    return true;
  });

  const onPress = useCallback(
    (item) => {
      Keyboard.dismiss();
      if (query.trim()) saveHistory(query.trim());
      actions.openItem(item, results);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actions, results, query, history]
  );
  const onMore = useCallback((item) => actions.showMore(item, { showInFolder: true }), [actions]);

  const renderItem = useCallback(({ item }) => <FileRow item={item} showPath onPress={onPress} onMore={onMore} />, [onPress, onMore]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <LinearGradient colors={t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bar, { paddingTop: insets.top + 6 }]}>
        <IconButton name="arrow-left" color="#fff" onPress={() => nav.pop()} />
        <View style={styles.inputWrap}>
          <Icon name="magnify" size={20} color="rgba(255,255,255,0.9)" />
          <TextInput
            value={query}
            onChangeText={onChange}
            autoFocus
            placeholder={base === FS.ROOT ? 'Search all files' : `Search in ${nameOf(base)}`}
            placeholderTextColor="rgba(255,255,255,0.7)"
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={() => {
              clearTimeout(timer.current);
              run(query);
              if (query.trim()) saveHistory(query.trim());
            }}
          />
          {query ? (
            <Pressable onPress={() => onChange('')} hitSlop={8}>
              <Icon name="close-circle" size={18} color="#fff" />
            </Pressable>
          ) : null}
        </View>
      </LinearGradient>
      {busy ? <ActivityIndicator color={t.brand} style={{ marginVertical: 12 }} /> : null}
      {query.trim().length < 2 ? (
        history.length ? (
          <View style={{ padding: 16 }}>
            <View style={styles.histHead}>
              <Text style={[styles.histTitle, { color: t.text }]}>Recent searches</Text>
              <Pressable
                onPress={() => {
                  setHistory([]);
                  AsyncStorage.removeItem(HISTORY_KEY).catch(() => {});
                }}
              >
                <Text style={{ color: t.brand, fontWeight: '700' }}>Clear</Text>
              </Pressable>
            </View>
            <View style={styles.histWrap}>
              {history.map((h) => (
                <Pressable key={h} onPress={() => onChange(h)} style={[styles.histChip, { backgroundColor: t.card, borderColor: t.border }]}>
                  <Icon name="history" size={16} color={t.sub} />
                  <Text style={[styles.histText, { color: t.text }]}>{h}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <EmptyState icon="text-search" title="Find anything" message="Type at least 2 letters of a file or folder name." />
        )
      ) : (
        <FlatList
          data={results}
          keyExtractor={(i) => i.path}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={14}
          windowSize={9}
          removeClippedSubviews
          ListHeaderComponent={
            results.length ? <Text style={[styles.count, { color: t.sub }]}>{results.length >= 400 ? '400+ results' : `${results.length} results`}</Text> : null
          }
          ListEmptyComponent={busy ? null : <EmptyState icon="file-search-outline" title="No results" message={`Nothing named "${query.trim()}" was found.`} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 12 },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingHorizontal: 12, height: 46, marginRight: 10, backgroundColor: 'rgba(255,255,255,0.18)' },
  input: { flex: 1, fontSize: 16, marginLeft: 8, paddingVertical: 0, color: '#fff' },
  histHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  histTitle: { fontSize: 16, fontWeight: '700' },
  histWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  histChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, marginRight: 8, marginBottom: 8 },
  histText: { marginLeft: 6, fontSize: 14 },
  count: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 12, fontWeight: '600' },
});
