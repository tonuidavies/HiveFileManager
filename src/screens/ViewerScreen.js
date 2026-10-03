import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconButton } from '../components/UI';
import { useBackHandler, useNav } from '../navigation';
import { useFileActions } from '../state/useFileActions';
import { formatBytes, toUri } from '../utils/files';

export default function ViewerScreen({ params }) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const actions = useFileActions();
  const [items, setItems] = useState(params.items || []);
  const [index, setIndex] = useState(params.index || 0);
  const [chrome, setChrome] = useState(true);
  const listRef = useRef(null);
  const current = items[index];

  useBackHandler(() => {
    nav.pop();
    return true;
  });

  const onViewable = useRef(({ viewableItems }) => {
    if (viewableItems.length) setIndex(viewableItems[0].index ?? 0);
  }).current;

  const remove = useCallback(async () => {
    if (!current) return;
    const done = await actions.deleteItems([current]);
    if (!done) return;
    const next = items.filter((i) => i.path !== current.path);
    if (!next.length) {
      nav.pop();
      return;
    }
    setItems(next);
    setIndex((i) => Math.min(i, next.length - 1));
  }, [actions, current, items, nav]);

  if (!current) return <View style={styles.bg} />;

  return (
    <View style={styles.bg}>
      <FlatList
        ref={listRef}
        data={items}
        horizontal
        pagingEnabled
        initialScrollIndex={Math.min(params.index || 0, Math.max(0, items.length - 1))}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(i) => i.path}
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        renderItem={({ item }) => (
          <Pressable onPress={() => setChrome((c) => !c)} style={{ width, height }}>
            <Image source={{ uri: toUri(item.path) }} style={{ width, height }} contentFit="contain" recyclingKey={item.path} transition={150} />
          </Pressable>
        )}
      />
      {chrome ? (
        <>
          <View style={[styles.top, { paddingTop: insets.top + 4 }]}>
            <IconButton name="arrow-left" color="#fff" onPress={() => nav.pop()} />
            <View style={{ flex: 1, marginLeft: 4 }}>
              <Text style={styles.title} numberOfLines={1}>
                {current.name}
              </Text>
              <Text style={styles.sub}>
                {index + 1} of {items.length} · {formatBytes(current.size)}
              </Text>
            </View>
          </View>
          <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
            <Action icon="share-variant" label="Share" onPress={() => actions.shareItems([current])} />
            <Action icon="open-in-new" label="Open with" onPress={() => actions.openExternally(current, 'chooser')} />
            <Action icon="information-outline" label="Details" onPress={() => actions.showDetails(current)} />
            <Action icon="trash-can-outline" label="Delete" onPress={remove} />
          </View>
        </>
      ) : null}
    </View>
  );
}

function Action({ icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.action}>
      <Icon name={icon} size={24} color="#fff" />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingBottom: 8, paddingHorizontal: 4, backgroundColor: 'rgba(0,0,0,0.45)' },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 1 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', paddingTop: 12, backgroundColor: 'rgba(0,0,0,0.45)' },
  action: { flex: 1, alignItems: 'center' },
  actionText: { color: '#fff', fontSize: 11, marginTop: 4, fontWeight: '600' },
});
