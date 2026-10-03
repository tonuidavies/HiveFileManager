import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, useTheme } from '../theme';

const UIContext = createContext(null);
export const useUI = () => useContext(UIContext);

export function UIProvider({ children }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [dialog, setDialog] = useState(null); // { type, title, message, ... , resolve }
  const [sheet, setSheet] = useState(null); // { title, subtitle, actions }
  const [toastMsg, setToastMsg] = useState(null);
  const [progress, setProgress] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef(null);

  const toast = useCallback(
    (msg) => {
      clearTimeout(toastTimer.current);
      setToastMsg(msg);
      Animated.spring(toastAnim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
      toastTimer.current = setTimeout(() => {
        Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToastMsg(null));
      }, 2200);
    },
    [toastAnim]
  );

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setDialog({ type: 'confirm', confirmText: 'OK', cancelText: 'Cancel', ...opts, resolve });
      }),
    []
  );

  const alert = useCallback(
    (title, message) =>
      new Promise((resolve) => {
        setDialog({ type: 'alert', title, message, confirmText: 'OK', resolve });
      }),
    []
  );

  const prompt = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setInputValue(opts.initial || '');
        setDialog({ type: 'prompt', confirmText: 'OK', cancelText: 'Cancel', ...opts, resolve });
      }),
    []
  );

  const showSheet = useCallback(
    (opts) => {
      setSheet(opts);
      sheetAnim.setValue(0);
      Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, friction: 9, tension: 70 }).start();
    },
    [sheetAnim]
  );

  const closeSheet = useCallback(
    (after) => {
      Animated.timing(sheetAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
        setSheet(null);
        if (after) after();
      });
    },
    [sheetAnim]
  );

  const closeDialog = (result) => {
    const d = dialog;
    setDialog(null);
    if (d) d.resolve(result);
  };

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const value = useMemo(
    () => ({ toast, confirm, alert, prompt, sheet: showSheet, progress: setProgress }),
    [toast, confirm, alert, prompt, showSheet]
  );

  const sheetTranslate = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [500, 0] });

  return (
    <UIContext.Provider value={value}>
      {children}

      {/* Bottom sheet */}
      <Modal visible={!!sheet} transparent animationType="fade" statusBarTranslucent onRequestClose={() => closeSheet()}>
        <Pressable style={[styles.overlay, { backgroundColor: t.overlay }]} onPress={() => closeSheet()} />
        {sheet ? (
          <Animated.View
            style={[
              styles.sheet,
              { backgroundColor: t.card, paddingBottom: 12 + insets.bottom, transform: [{ translateY: sheetTranslate }] },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: t.border }]} />
            {sheet.title ? (
              <View style={styles.sheetHead}>
                {sheet.header || null}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetTitle, { color: t.text }]} numberOfLines={1}>
                    {sheet.title}
                  </Text>
                  {sheet.subtitle ? (
                    <Text style={[styles.sheetSub, { color: t.sub }]} numberOfLines={1}>
                      {sheet.subtitle}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}
            <ScrollView style={{ maxHeight: 460 }} bounces={false}>
              {sheet.actions.filter(Boolean).map((a, idx) => (
                <Pressable
                  key={`${idx}-${a.label}`}
                  android_ripple={{ color: t.selected }}
                  style={({ pressed }) => [styles.sheetItem, pressed && { backgroundColor: t.cardAlt }]}
                  onPress={() => closeSheet(a.onPress)}
                >
                  <View style={[styles.sheetIcon, { backgroundColor: a.destructive ? 'rgba(239,68,68,0.12)' : t.selected }]}>
                    <MaterialCommunityIcons name={a.icon} size={20} color={a.destructive ? t.danger : t.brand} />
                  </View>
                  <Text style={[styles.sheetLabel, { color: a.destructive ? t.danger : t.text }]}>{a.label}</Text>
                  {a.right ? <Text style={[styles.sheetRight, { color: t.sub }]}>{a.right}</Text> : null}
                  {a.checked ? <MaterialCommunityIcons name="check" size={20} color={t.brand} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        ) : null}
      </Modal>

      {/* Dialogs */}
      <Modal visible={!!dialog} transparent animationType="fade" statusBarTranslucent onRequestClose={() => closeDialog(dialog?.type === 'prompt' ? null : false)}>
        <View style={[styles.center, { backgroundColor: t.overlay }]}>
          {dialog ? (
            <View style={[styles.dialog, { backgroundColor: t.card }]}>
              {dialog.icon ? (
                <View style={[styles.dialogIcon, { backgroundColor: dialog.destructive ? 'rgba(239,68,68,0.12)' : t.selected }]}>
                  <MaterialCommunityIcons name={dialog.icon} size={26} color={dialog.destructive ? t.danger : t.brand} />
                </View>
              ) : null}
              <Text style={[styles.dialogTitle, { color: t.text }]}>{dialog.title}</Text>
              {dialog.message ? <Text style={[styles.dialogMsg, { color: t.sub }]}>{dialog.message}</Text> : null}
              {dialog.type === 'prompt' ? (
                <TextInput
                  value={inputValue}
                  onChangeText={setInputValue}
                  placeholder={dialog.placeholder}
                  placeholderTextColor={t.faint}
                  autoFocus
                  selectTextOnFocus
                  style={[styles.input, { color: t.text, borderColor: t.brand, backgroundColor: t.cardAlt }]}
                  onSubmitEditing={() => inputValue.trim() && closeDialog(inputValue.trim())}
                />
              ) : null}
              <View style={styles.dialogBtns}>
                {dialog.type !== 'alert' ? (
                  <Pressable style={styles.btnGhost} onPress={() => closeDialog(dialog.type === 'prompt' ? null : false)}>
                    <Text style={[styles.btnGhostText, { color: t.sub }]}>{dialog.cancelText}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={[styles.btn, { backgroundColor: dialog.destructive ? t.danger : t.brand }]}
                  onPress={() => {
                    if (dialog.type === 'prompt') {
                      if (inputValue.trim()) closeDialog(inputValue.trim());
                    } else closeDialog(true);
                  }}
                >
                  <Text style={styles.btnText}>{dialog.confirmText}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      {/* Progress */}
      <Modal visible={!!progress} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
        <View style={[styles.center, { backgroundColor: t.overlay }]}>
          <View style={[styles.progress, { backgroundColor: t.card }]}>
            <ActivityIndicator color={t.brand} size="large" />
            <Text style={[styles.progressText, { color: t.text }]}>{progress}</Text>
          </View>
        </View>
      </Modal>

      {/* Toast */}
      {toastMsg ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            {
              bottom: 90 + insets.bottom,
              opacity: toastAnim,
              transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
            },
          ]}
        >
          <Text style={styles.toastText}>{toastMsg}</Text>
        </Animated.View>
      ) : null}
    </UIContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 8,
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
  sheetSub: { fontSize: 12, marginTop: 2 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  sheetIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  sheetLabel: { fontSize: 15, flex: 1, fontWeight: '500' },
  sheetRight: { fontSize: 13, marginRight: 6 },
  dialog: { width: '100%', maxWidth: 380, borderRadius: radius.xl, padding: 22 },
  dialogIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  dialogTitle: { fontSize: 19, fontWeight: '700' },
  dialogMsg: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginTop: 16 },
  dialogBtns: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 22 },
  btnGhost: { paddingHorizontal: 16, paddingVertical: 10, marginRight: 6 },
  btnGhostText: { fontSize: 15, fontWeight: '600' },
  btn: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 14 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  progress: { borderRadius: radius.lg, padding: 24, alignItems: 'center', minWidth: 200 },
  progressText: { marginTop: 14, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(22,20,31,0.94)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    maxWidth: '86%',
  },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '500', textAlign: 'center' },
});
