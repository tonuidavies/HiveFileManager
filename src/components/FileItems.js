import React, { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Icon } from './UI';
import { useTheme } from '../theme';
import { formatBytes, formatDate, kindOf, kindStyle, toUri } from '../utils/files';
import { ROOT, getCachedThumb, mediaThumbnail } from '../native/HiveStorage';

export const ROW_HEIGHT = 68;

function useMediaThumb(path, enabled) {
  const [uri, setUri] = useState(() => (enabled ? getCachedThumb(path) : null));
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const cached = getCachedThumb(path);
    if (cached !== undefined) {
      setUri(cached);
      return undefined;
    }
    mediaThumbnail(path).then((u) => alive && setUri(u));
    return () => {
      alive = false;
    };
  }, [path, enabled]);
  return uri;
}

export const FileIcon = memo(function FileIcon({ item, size = 44, rounded = 12 }) {
  const t = useTheme();
  const kind = kindOf(item);
  const style = kindStyle(kind);
  const isMedia = kind === 'video' || kind === 'audio';
  const thumb = useMediaThumb(item.path, isMedia);

  if (kind === 'image') {
    return (
      <View style={[styles.iconBox, { width: size, height: size, borderRadius: rounded, backgroundColor: t.cardAlt }]}>
        <Image
          source={{ uri: toUri(item.path) }}
          style={{ width: size, height: size, borderRadius: rounded }}
          contentFit="cover"
          recyclingKey={item.path}
          cachePolicy="memory-disk"
          transition={120}
        />
      </View>
    );
  }
  if (isMedia && thumb) {
    return (
      <View style={[styles.iconBox, { width: size, height: size, borderRadius: rounded, backgroundColor: t.cardAlt }]}>
        <Image source={{ uri: thumb }} style={{ width: size, height: size, borderRadius: rounded }} contentFit="cover" recyclingKey={item.path} transition={120} />
        {kind === 'video' ? (
          <View style={styles.playBadge}>
            <Icon name="play" size={Math.max(12, size * 0.28)} color="#fff" />
          </View>
        ) : null}
      </View>
    );
  }
  if (kind === 'folder') {
    return (
      <View style={[styles.iconBox, { width: size, height: size, borderRadius: rounded, backgroundColor: 'rgba(245,184,61,0.16)' }]}>
        <Icon name={item.count === 0 ? 'folder-outline' : 'folder'} size={size * 0.62} color={t.folder} />
      </View>
    );
  }
  return (
    <View style={[styles.iconBox, { width: size, height: size, borderRadius: rounded, backgroundColor: style.color + '22' }]}>
      <Icon name={style.icon} size={size * 0.55} color={style.color} />
    </View>
  );
});

function subtitleOf(item, showPath) {
  if (showPath) {
    const dir = item.path.slice(0, item.path.lastIndexOf('/'));
    return dir.startsWith(ROOT) ? 'Internal storage' + dir.slice(ROOT.length) : dir;
  }
  if (item.isDir) return `${item.count} ${item.count === 1 ? 'item' : 'items'}  ·  ${formatDate(item.mtime)}`;
  return `${formatBytes(item.size)}  ·  ${formatDate(item.mtime)}`;
}

export const FileRow = memo(function FileRow({ item, selected, selecting, favorite, showPath, onPress, onLongPress, onMore }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress && onLongPress(item)}
      delayLongPress={280}
      android_ripple={{ color: t.selected }}
      style={[styles.row, selected && { backgroundColor: t.selected }]}
    >
      <FileIcon item={item} />
      <View style={styles.rowText}>
        <View style={styles.nameLine}>
          <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          {favorite ? <Icon name="star" size={14} color="#F5B83D" style={{ marginLeft: 4 }} /> : null}
        </View>
        <Text style={[styles.meta, { color: t.sub }]} numberOfLines={1}>
          {subtitleOf(item, showPath)}
        </Text>
      </View>
      {selecting ? (
        <Icon name={selected ? 'check-circle' : 'checkbox-blank-circle-outline'} size={24} color={selected ? t.brand : t.faint} style={styles.trailing} />
      ) : onMore ? (
        <Pressable hitSlop={10} onPress={() => onMore(item)} style={styles.trailing}>
          <Icon name="dots-vertical" size={22} color={t.faint} />
        </Pressable>
      ) : null}
    </Pressable>
  );
});

export const FileGridCell = memo(function FileGridCell({ item, size, selected, selecting, onPress, onLongPress }) {
  const t = useTheme();
  const kind = kindOf(item);
  const visual = kind === 'image' || kind === 'video';
  return (
    <Pressable
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress && onLongPress(item)}
      delayLongPress={280}
      style={[styles.cell, { width: size }, selected && { backgroundColor: t.selected }]}
    >
      <FileIcon item={item} size={visual ? size - 12 : size * 0.62} rounded={visual ? 14 : 18} />
      {visual ? null : (
        <Text style={[styles.cellName, { color: t.text }]} numberOfLines={2}>
          {item.name}
        </Text>
      )}
      {selecting ? (
        <View style={styles.cellCheck}>
          <Icon name={selected ? 'check-circle' : 'checkbox-blank-circle-outline'} size={22} color={selected ? t.brand : '#fff'} />
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  iconBox: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  playBadge: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    padding: 3,
  },
  row: { height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  rowText: { flex: 1, marginLeft: 14, justifyContent: 'center' },
  nameLine: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  meta: { fontSize: 12, marginTop: 3 },
  trailing: { marginLeft: 8, padding: 4 },
  cell: { alignItems: 'center', paddingVertical: 6, borderRadius: 16 },
  cellName: { fontSize: 12, marginTop: 6, textAlign: 'center', paddingHorizontal: 4, fontWeight: '500' },
  cellCheck: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 12 },
});
