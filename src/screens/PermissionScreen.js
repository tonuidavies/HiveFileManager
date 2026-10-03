import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, PrimaryButton } from '../components/UI';
import { useTheme } from '../theme';
import { isNativeAvailable, requestStorageAccess } from '../native/HiveStorage';
import { suppressAppOpen } from '../ads/AdManager';

const POINTS = [
  { icon: 'lightning-bolt', title: 'One-time setup', text: 'Allow once. Android remembers it, so you will not be asked again.' },
  { icon: 'folder-multiple', title: 'All your files in one place', text: 'Browse photos, videos, documents, downloads and APKs.' },
  { icon: 'shield-lock', title: 'Private by design', text: 'Your files stay on your phone. Nothing is uploaded.' },
];

export default function PermissionScreen({ onGranted }) {
  const t = useTheme();
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
        <Text style={styles.heroTitle}>Hive File Manager</Text>
        <Text style={styles.heroSub}>Fast, clean and simple file management</Text>
      </LinearGradient>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        {POINTS.map((p) => (
          <View key={p.title} style={styles.point}>
            <View style={[styles.pointIcon, { backgroundColor: t.selected }]}>
              <Icon name={p.icon} size={22} color={t.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pointTitle, { color: t.text }]}>{p.title}</Text>
              <Text style={[styles.pointText, { color: t.sub }]}>{p.text}</Text>
            </View>
          </View>
        ))}

        <View style={[styles.note, { backgroundColor: t.card, borderColor: t.border }]}>
          <Icon name="information-outline" size={18} color={t.brand} />
          <Text style={[styles.noteText, { color: t.sub }]}>
            On the next screen, turn on <Text style={{ fontWeight: '700', color: t.text }}>"Allow access to manage all files"</Text>, then press back.
          </Text>
        </View>

        {denied ? <Text style={[styles.denied, { color: t.danger }]}>Access is needed to show your files. Tap the button to try again.</Text> : null}
        {!isNativeAvailable ? (
          <Text style={[styles.denied, { color: t.danger }]}>This build is missing the storage module. Please rebuild the app.</Text>
        ) : null}

        <PrimaryButton title="Allow access" icon="check-circle" onPress={ask} style={{ marginTop: 20 }} />
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
