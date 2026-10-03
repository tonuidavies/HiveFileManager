import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = '@hive_settings_v2';
// Keys used by the previous version of the app (migrated once, then removed)
const OLD_PWD_KEY = '@hive_pwd_final';
const OLD_LOCK_KEY = '@hive_lock_final';
const OLD_ROOT_KEY = '@hive_root_final';

export const DEFAULT_SETTINGS = {
  themeMode: 'system', // system | light | dark
  showHidden: false,
  viewMode: 'list', // list | grid
  sortBy: 'name', // name | date | size | type
  sortDir: 'asc',
  confirmDelete: true,
  useTrash: true,
  favorites: [],
  lockEnabled: false,
  pin: null,
  biometric: true,
  onboarded: false,
};

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [clipboard, setClipboard] = useState(null); // { mode: 'copy' | 'move', items: [item] }
  const [refreshToken, setRefreshToken] = useState(0); // bump to make screens reload after file changes
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        let next = { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
        if (!raw) {
          // Migrate app lock from the old version so existing users keep their PIN
          const [oldPwd, oldLock] = await Promise.all([AsyncStorage.getItem(OLD_PWD_KEY), AsyncStorage.getItem(OLD_LOCK_KEY)]);
          if (oldPwd && /^\d{4}$/.test(oldPwd)) {
            next = { ...next, pin: oldPwd, lockEnabled: oldLock === 'true', onboarded: true };
          }
          await AsyncStorage.multiRemove([OLD_PWD_KEY, OLD_LOCK_KEY, OLD_ROOT_KEY]).catch(() => {});
          await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
        }
        setSettings(next);
      } catch {
        // keep defaults
      }
      setLoaded(true);
    })();
  }, []);

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
      }, 150);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback(
    (path) =>
      update((prev) => ({
        favorites: prev.favorites.includes(path) ? prev.favorites.filter((p) => p !== path) : [path, ...prev.favorites].slice(0, 30),
      })),
    [update]
  );

  const bumpRefresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  const value = useMemo(
    () => ({ settings, loaded, update, toggleFavorite, clipboard, setClipboard, refreshToken, bumpRefresh }),
    [settings, loaded, update, toggleFavorite, clipboard, refreshToken, bumpRefresh]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);
