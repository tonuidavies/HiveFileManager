import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, StyleSheet, Text, ToastAndroid, useColorScheme, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider, themes } from './src/theme';
import { StoreProvider, useStore } from './src/state/store';
import { UIProvider } from './src/components/Overlays';
import { Icon } from './src/components/UI';
import { NavContext, ScreenContainer } from './src/navigation';
import { hasStorageAccess } from './src/native/HiveStorage';
import { purgeOldTrash } from './src/state/trash';
import { initAds, onAppForeground, onColdStartReady } from './src/ads/AdManager';

import PermissionScreen from './src/screens/PermissionScreen';
import LockScreen from './src/screens/LockScreen';
import HomeScreen from './src/screens/HomeScreen';
import BrowserScreen from './src/screens/BrowserScreen';
import CategoryScreen from './src/screens/CategoryScreen';
import SearchScreen from './src/screens/SearchScreen';
import CleanerScreen from './src/screens/CleanerScreen';
import TrashScreen from './src/screens/TrashScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ViewerScreen from './src/screens/ViewerScreen';
import EditorScreen from './src/screens/EditorScreen';

const SCREENS = {
  home: HomeScreen,
  browser: BrowserScreen,
  category: CategoryScreen,
  search: SearchScreen,
  cleaner: CleanerScreen,
  trash: TrashScreen,
  settings: SettingsScreen,
  viewer: ViewerScreen,
  editor: EditorScreen,
};

const RELOCK_AFTER_MS = 30 * 1000;
const MAX_STACK = 12;

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Root />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { settings, loaded, update } = useStore();
  const scheme = useColorScheme();
  const mode = settings.themeMode === 'system' ? (scheme === 'dark' ? 'dark' : 'light') : settings.themeMode;
  const theme = themes[mode];

  const [access, setAccess] = useState(() => hasStorageAccess());
  const [locked, setLocked] = useState(null); // null until settings are loaded
  const backgroundAt = useRef(0);
  const coldStartDone = useRef(false);

  // Ads (consent first) + housekeeping, once
  useEffect(() => {
    initAds();
    purgeOldTrash().catch(() => {});
  }, []);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.bg).catch(() => {});
  }, [theme.bg]);

  // Lock state is known once settings are loaded
  useEffect(() => {
    if (loaded) setLocked(!!(settings.lockEnabled && settings.pin));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Foreground / background handling: silent permission re-check, re-lock, app-open ad
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundAt.current = Date.now();
        return;
      }
      if (state !== 'active') return;
      const away = backgroundAt.current ? Date.now() - backgroundAt.current : 0;
      backgroundAt.current = 0;
      // Permission is only re-checked silently. We never prompt again once granted.
      setAccess(hasStorageAccess());
      if (settings.lockEnabled && settings.pin && away >= RELOCK_AFTER_MS) {
        setLocked(true);
        return;
      }
      onAppForeground(away);
    });
    return () => sub.remove();
  }, [settings.lockEnabled, settings.pin]);

  const ready = loaded && locked === false && access;

  useEffect(() => {
    if (ready && !coldStartDone.current) {
      coldStartDone.current = true;
      setTimeout(onColdStartReady, 600);
    }
  }, [ready]);

  let content;
  if (!loaded || locked === null) {
    content = <Splash theme={theme} />;
  } else if (locked) {
    content = (
      <LockScreen
        mode="unlock"
        pin={settings.pin}
        biometric={settings.biometric}
        onUnlock={() => setLocked(false)}
        onForgot={() => {
          update({ lockEnabled: false, pin: null });
          setLocked(false);
        }}
      />
    );
  } else if (!access) {
    content = <PermissionScreen onGranted={() => setAccess(true)} />;
  } else {
    content = <Navigator theme={theme} />;
  }

  return (
    <ThemeProvider value={theme}>
      <UIProvider>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: theme.bg }}>{content}</View>
      </UIProvider>
    </ThemeProvider>
  );
}

function Splash({ theme }) {
  return (
    <LinearGradient colors={theme.gradient} style={styles.splash}>
      <Icon name="hexagon-multiple" size={72} color="#fff" />
      <Text style={styles.splashText}>Hive Files</Text>
    </LinearGradient>
  );
}

let keySeq = 0;

function Navigator({ theme }) {
  const [stack, setStack] = useState([{ key: 'home', name: 'home', params: {} }]);
  const lastBack = useRef(0);

  const push = useCallback((name, params = {}) => {
    setStack((s) => {
      const next = [...s, { key: `${name}-${++keySeq}`, name, params }];
      // keep memory bounded: drop the oldest non-home screens
      return next.length > MAX_STACK ? [next[0], ...next.slice(next.length - MAX_STACK + 1)] : next;
    });
  }, []);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const reset = useCallback(() => setStack((s) => [s[0]]), []);

  // Root back handler (runs last). Screens handle their own back first.
  const depth = stack.length;
  const depthRef = useRef(depth);
  depthRef.current = depth;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (depthRef.current > 1) {
        pop();
        return true;
      }
      const now = Date.now();
      if (now - lastBack.current < 2000) return false; // exit
      lastBack.current = now;
      ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      return true;
    });
    return () => sub.remove();
  }, [pop]);

  const nav = useMemo(() => ({ push, pop, reset, depth }), [push, pop, reset, depth]);

  return (
    <NavContext.Provider value={nav}>
      <View style={{ flex: 1 }}>
        {stack.map((route, i) => {
          const Screen = SCREENS[route.name];
          const focused = i === stack.length - 1;
          return (
            <ScreenContainer key={route.key} focused={focused} animate={i > 0} bg={theme.bg} fullBleed={route.name === 'viewer'}>
              <Screen params={route.params} />
            </ScreenContainer>
          );
        })}
      </View>
    </NavContext.Provider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  splashText: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 14 },
});
