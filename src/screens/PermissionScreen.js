import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, PrimaryButton } from '../components/UI';
import { useTheme } from '../theme';
import { isNativeAvailable, requestStorageAccess } from '../native/HiveStorage';
import { suppressAppOpen } from '../ads/AdManager';
import { useT } from '../i18n';

const POINTS = [
  { icon: 'lightning-bolt', titleKey: 'perm_1_title', textKey: 'perm_1_text' },
  { icon: 'folder-multiple', titleKey: 'perm_2_title', textKey: 'perm_2_text' },
  { icon: 'shield-lock', titleKey: 'perm_3_title', textKey: 'perm_3_text' },
];

export default function PermissionScreen({ onGranted }) {
  const t = useTheme();
  const tx = useT();
  const insets = useSafeAreaInsets();
  const [denied, setDenied] = useState(false);

  const ask = async () => {
    suppressAppOpen(5 * 60 * 1000);
    try {
      const res = await requestStorageAccess();
      if (res === true) onGranted();
      else if (res === false) setDenied(true);
      // 'settings' -> App re-checks automatically when the user comes back
    } catch {
      setDenied(true);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <LinearGradient colors={t.gradient} style={[styles.hero, { paddingTop: insets.top + 36 }]}>
        <View style={styles.logo}>
          <Icon name="folder-open" size={56} color="#fff" />
        </View>
        <Text style={styles.heroTitle}>{tx('app_name')}</Text>
        <Text style={styles.heroSub}>{tx('perm_sub')}</Text>
      </LinearGradient>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        {POINTS.map((p) => (
          <View key={p.titleKey} style={styles.point}>
            <View style={[styles.pointIcon, { backgroundColor: t.selected }]}>
              <Icon name={p.icon} size={22} color={t.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pointTitle, { color: t.text }]}>{tx(p.titleKey)}</Text>
              <Text style={[styles.pointText, { color: t.sub }]}>{tx(p.textKey)}</Text>
            </View>
          </View>
        ))}

        <View style={[styles.note, { backgroundColor: t.card, borderColor: t.border }]}>
          <Icon name="information-outline" size={18} color={t.brand} />
          <Text style={[styles.noteText, { color: t.sub }]}>
            {tx('perm_note_pre')}
            <Text style={{ fontWeight: '700', color: t.text }}>{tx('perm_note_bold')}</Text>
            {tx('perm_note_post')}
          </Text>
        </View>

        {denied ? <Text style={[styles.denied, { color: t.danger }]}>{tx('perm_denied')}</Text> : null}
        {!isNativeAvailable ? (
          <Text style={[styles.denied, { color: t.danger }]}>{tx('perm_missing_module')}</Text>
        ) : null}

        <PrimaryButton title={tx('allow_access')} icon="check-circle" onPress={ask} style={{ marginTop: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingBottom: 36, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  logo: { width: 96, height: 96, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 18 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 6 },
  body: { padding: 22 },
  point: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  pointIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  pointTitle: { fontSize: 16, fontWeight: '700' },
  pointText: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  note: { flexDirection: 'row', borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, marginTop: 6 },
  noteText: { flex: 1, marginLeft: 10, fontSize: 13, lineHeight: 19 },
  denied: { marginTop: 14, fontSize: 13, textAlign: 'center' },
});
