import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/UI';
import { useTheme } from '../theme';
import { suppressAppOpen } from '../ads/AdManager';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'];

export async function biometricAvailable() {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

/**
 * mode: 'unlock' -> check against `pin`
 *       'set'    -> choose + confirm a new PIN, then onSet(pin)
 */
export default function LockScreen({ mode = 'unlock', pin, biometric, onUnlock, onSet, onCancel, onForgot }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [entry, setEntry] = useState('');
  const [first, setFirst] = useState(null);
  const [error, setError] = useState(null);
  const [bioOk, setBioOk] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;

  const tryBiometric = useCallback(async () => {
    suppressAppOpen(30 * 1000);
    try {
      const r = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Hive Files',
        cancelLabel: 'Use PIN',
        disableDeviceFallback: true,
      });
      if (r.success) onUnlock && onUnlock();
    } catch {}
  }, [onUnlock]);

  useEffect(() => {
    if (mode !== 'unlock' || !biometric) return;
    biometricAvailable().then((ok) => {
      setBioOk(ok);
      if (ok) tryBiometric();
    });
  }, [mode, biometric, tryBiometric]);

  const fail = (msg) => {
    setError(msg);
    setEntry('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    Animated.sequence([
      Animated.timing(shake, { toValue: 12, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -12, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const complete = (value) => {
    if (mode === 'unlock') {
      if (value === pin) onUnlock && onUnlock();
      else fail('Wrong PIN. Try again.');
      return;
    }
    if (!first) {
      setFirst(value);
      setEntry('');
      setError(null);
      return;
    }
    if (value === first) onSet && onSet(value);
    else {
      setFirst(null);
      fail('PINs did not match. Start again.');
    }
  };

  const press = (k) => {
    if (k === 'del') {
      setEntry((e) => e.slice(0, -1));
      return;
    }
    if (k === 'bio') {
      if (mode === 'unlock' && bioOk) tryBiometric();
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    const next = (entry + k).slice(0, 4);
    setEntry(next);
    setError(null);
    if (next.length === 4) setTimeout(() => complete(next), 80);
  };

  const forgot = async () => {
    suppressAppOpen(60 * 1000);
    try {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Verify it’s you to reset the app lock', disableDeviceFallback: false });
      if (r.success) onForgot && onForgot();
      else setError('Verification failed.');
    } catch {
      setError('Set a screen lock on your phone to reset the PIN.');
    }
  };

  const title = mode === 'unlock' ? 'Enter your PIN' : first ? 'Confirm your new PIN' : 'Create a 4-digit PIN';

  return (
    <LinearGradient colors={t.gradient} style={[styles.wrap, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.lockIcon}>
        <Icon name={mode === 'unlock' ? 'lock' : 'lock-plus'} size={34} color="#fff" />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Animated.View style={[styles.dots, { transform: [{ translateX: shake }] }]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i < entry.length && styles.dotOn]} />
        ))}
      </Animated.View>
      <Text style={styles.error}>{error || ' '}</Text>

      <View style={styles.pad}>
        {KEYS.map((k) => {
          if (k === 'bio' && !(mode === 'unlock' && bioOk)) return <View key={k} style={styles.key} />;
          return (
            <Pressable key={k} onPress={() => press(k)} style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}>
              {k === 'del' ? (
                <Icon name="backspace-outline" size={28} color="#fff" />
              ) : k === 'bio' ? (
                <Icon name="fingerprint" size={32} color="#fff" />
              ) : (
                <Text style={styles.keyText}>{k}</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {mode === 'set' ? (
        <Pressable onPress={onCancel} style={styles.link}>
          <Text style={styles.linkText}>Cancel</Text>
        </Pressable>
      ) : (
        <Pressable onPress={forgot} style={styles.link}>
          <Text style={styles.linkText}>Forgot PIN?</Text>
        </Pressable>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center' },
  lockIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 20 },
  dots: { flexDirection: 'row', marginTop: 26 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#fff', marginHorizontal: 10 },
  dotOn: { backgroundColor: '#fff' },
  error: { color: '#FFE4E6', marginTop: 14, fontSize: 13, fontWeight: '600' },
  pad: { width: 300, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 'auto' },
  key: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginVertical: 6 },
  keyPressed: { backgroundColor: 'rgba(255,255,255,0.18)' },
  keyText: { color: '#fff', fontSize: 30, fontWeight: '500' },
  link: { padding: 14, marginTop: 8 },
  linkText: { color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '600' },
});
