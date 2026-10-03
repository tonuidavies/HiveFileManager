import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, useTheme } from '../theme';

export const Icon = MaterialCommunityIcons;

export const IconButton = memo(function IconButton({ name, onPress, color, size = 24, style, disabled, badge }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: true, radius: 22 }}
      style={[styles.iconBtn, disabled && { opacity: 0.4 }, style]}
    >
      <Icon name={name} size={size} color={color || t.text} />
      {badge ? <View style={[styles.badge, { backgroundColor: t.danger }]} /> : null}
    </Pressable>
  );
});

/** Gradient app bar used on every screen. */
export function GradientHeader({ title, subtitle, left, right, children, compact }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: insets.top }}>
      <View style={[styles.headerRow, compact && { paddingBottom: 4 }]}>
        {left}
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.headerSub} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </LinearGradient>
  );
}

export function SectionTitle({ title, action, onAction, compact }) {
  const t = useTheme();
  return (
    <View style={[styles.section, compact && styles.sectionCompact]}>
      <Text style={[styles.sectionTitle, { color: t.text }, compact && { fontSize: 15 }]}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[styles.sectionAction, { color: t.brand }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ icon = 'folder-open-outline', title, message, action, onAction }) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: t.selected }]}>
        <Icon name={icon} size={44} color={t.brand} />
      </View>
      <Text style={[styles.emptyTitle, { color: t.text }]}>{title}</Text>
      {message ? <Text style={[styles.emptyMsg, { color: t.sub }]}>{message}</Text> : null}
      {action ? <PrimaryButton title={action} onPress={onAction} style={{ marginTop: 18 }} /> : null}
    </View>
  );
}

export function PrimaryButton({ title, onPress, icon, style, disabled, danger }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: danger ? t.danger : t.brand, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={20} color="#fff" style={{ marginRight: 8 }} /> : null}
      <Text style={styles.primaryText}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style, onPress }) {
  const t = useTheme();
  const content = [styles.card, { backgroundColor: t.card, shadowColor: t.shadow }, style];
  if (!onPress) return <View style={content}>{children}</View>;
  return (
    <Pressable onPress={onPress} android_ripple={{ color: t.selected }} style={({ pressed }) => [content, pressed && { opacity: 0.9 }]}>
      {children}
    </Pressable>
  );
}

export function Fab({ icon = 'plus', onPress, bottom = 20 }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fabWrap, { bottom, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
      <FabInner icon={icon} />
    </Pressable>
  );
}

function FabInner({ icon }) {
  const t = useTheme();
  return (
    <LinearGradient colors={t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
      <Icon name={icon} size={28} color="#fff" />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingTop: 6, paddingBottom: 10, minHeight: 56 },
  headerTitles: { flex: 1, paddingHorizontal: 6 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 1 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10, paddingHorizontal: 16 },
  sectionCompact: { marginTop: 12, marginBottom: 6 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  sectionAction: { fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 36, flex: 1 },
  emptyIcon: { width: 92, height: 92, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyMsg: { fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 16 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  card: {
    borderRadius: radius.lg,
    padding: 16,
    elevation: 2,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  fabWrap: { position: 'absolute', right: 18, borderRadius: 20, elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  fab: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
