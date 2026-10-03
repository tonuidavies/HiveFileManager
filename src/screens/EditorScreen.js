import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { GradientHeader, IconButton } from '../components/UI';
import { useTheme } from '../theme';
import { useBackHandler, useNav } from '../navigation';
import { useUI } from '../components/Overlays';
import { useStore } from '../state/store';
import { useFileActions } from '../state/useFileActions';
import * as FS from '../native/HiveStorage';
import { formatBytes } from '../utils/files';

export default function EditorScreen({ params }) {
  const t = useTheme();
  const nav = useNav();
  const ui = useUI();
  const { bumpRefresh } = useStore();
  const actions = useFileActions();
  const { item } = params;
  const [text, setText] = useState(null);
  const [original, setOriginal] = useState('');
  const dirty = text !== null && text !== original;

  useEffect(() => {
    FS.readText(item.path, 1024 * 1024)
      .then((s) => {
        setText(s);
        setOriginal(s);
      })
      .catch(() => {
        setText('');
        ui.toast('Could not read this file');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.path]);

  const save = async () => {
    try {
      await FS.writeText(item.path, text);
      setOriginal(text);
      bumpRefresh();
      ui.toast('Saved');
    } catch (e) {
      ui.alert('Could not save', e?.message);
    }
  };

  const close = async () => {
    if (dirty) {
      const ok = await ui.confirm({ title: 'Discard changes?', message: 'Your edits have not been saved.', confirmText: 'Discard', destructive: true });
      if (!ok) return;
    }
    nav.pop();
  };

  useBackHandler(() => {
    close();
    return true;
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <GradientHeader
        title={item.name}
        subtitle={dirty ? 'Unsaved changes' : formatBytes(item.size)}
        left={<IconButton name="arrow-left" color="#fff" onPress={close} />}
        right={
          <View style={{ flexDirection: 'row' }}>
            <IconButton name="share-variant" color="#fff" onPress={() => actions.shareItems([item])} />
            <IconButton name="content-save" color="#fff" disabled={!dirty} onPress={save} />
          </View>
        }
      />
      {text === null ? (
        <ActivityIndicator color={t.brand} style={{ marginTop: 40 }} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            style={[styles.editor, { color: t.text, backgroundColor: t.card }]}
          />
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { flex: 1, margin: 12, borderRadius: 16, padding: 14, fontSize: 14, lineHeight: 20, fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier' },
});
