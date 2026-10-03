import React, { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { GradientHeader, Icon, IconButton } from '../components/UI';
import { radius, useTheme } from '../theme';
import { useBackHandler, useNav } from '../navigation';
import { useStore } from '../state/store';
import { useUI } from '../components/Overlays';
import { useAdState } from '../ads/useAds';
import { ADS_REQUIRED, showPrivacyOptions, suppressAppOpen } from '../ads/AdManager';
import { useAdFreeFlow } from '../ads/useAdFree';
import LockScreen, { biometricAvailable } from './LockScreen';
import appJson from '../../app.json';

// Put your privacy policy link here (required by Google Play for apps with ads)
export const PRIVACY_POLICY_URL = '';

const PACKAGE = appJson.expo?.android?.package || '';
const VERSION = appJson.expo?.version || '';
const STORE_URL = `https://play.google.com/store/apps/details?id=${PACKAGE}`;

export default function SettingsScreen() {
  const t = useTheme();
  const nav = useNav();
  const ui = useUI();
  const { settings, update } = useStore();
  const { ready, adFree, adFreeUntil, privacyOptionsRequired } = useAdState();
  const [settingPin, setSettingPin] = useState(false);
  const [bio, setBio] = useState(false);

  useEffect(() => {
    biometricAvailable().then(setBio);
  }, []);

  useBackHandler(() => {
    nav.pop();
    return true;
  });

  const themeLabel = { system: 'System default', light: 'Light', dark: 'Dark' }[settings.themeMode];

  const chooseTheme = () =>
    ui.sheet({
      title: 'Theme',
      actions: [
        { label: 'System default', icon: 'theme-light-dark', checked: settings.themeMode === 'system', onPress: () => update({ themeMode: 'system' }) },
        { label: 'Light', icon: 'white-balance-sunny', checked: settings.themeMode === 'light', onPress: () => update({ themeMode: 'light' }) },
        { label: 'Dark', icon: 'weather-night', checked: settings.themeMode === 'dark', onPress: () => update({ themeMode: 'dark' }) },
      ],
    });

  const toggleLock = async (on) => {
    if (on) {
      setSettingPin(true);
      return;
    }
    const ok = await ui.confirm({ title: 'Turn off app lock?', message: 'Anyone with your phone will be able to open Hive.', confirmText: 'Turn off', destructive: true });
    if (ok) {
      update({ lockEnabled: false, pin: null });
      ui.toast('App lock turned off');
    }
  };

  const adFreeMinutes = adFree ? Math.max(1, Math.round((adFreeUntil - Date.now()) / 60000)) : 0;

  const askAdFree = useAdFreeFlow();

  const openUrl = (url) => {
    suppressAppOpen();
    Linking.openURL(url).catch(() => ui.toast('Could not open link'));
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <GradientHeader title="Settings" left={<IconButton name="arrow-left" color="#fff" onPress={() => nav.pop()} />} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Group title="Appearance">
          <Row icon="palette-outline" title="Theme" value={themeLabel} onPress={chooseTheme} />
          <Row
            icon={settings.viewMode === 'grid' ? 'view-grid-outline' : 'view-list-outline'}
            title="Default view"
            value={settings.viewMode === 'grid' ? 'Grid' : 'List'}
            onPress={() => update({ viewMode: settings.viewMode === 'grid' ? 'list' : 'grid' })}
          />
        </Group>

        <Group title="Files">
          <Row icon="eye-outline" title="Show hidden files" text="Files and folders starting with a dot" switchValue={settings.showHidden} onSwitch={(v) => update({ showHidden: v })} />
          <Row icon="trash-can-outline" title="Use Trash" text="Deleted items can be restored for 30 days" switchValue={settings.useTrash} onSwitch={(v) => update({ useTrash: v })} />
          <Row icon="help-circle-outline" title="Confirm before deleting" switchValue={settings.confirmDelete} onSwitch={(v) => update({ confirmDelete: v })} />
          <Row icon="delete-restore" title="Open Trash" onPress={() => nav.push('trash', {})} />
        </Group>

        <Group title="Security">
          <Row icon="lock-outline" title="App lock" text="Ask for a PIN when opening Hive" switchValue={settings.lockEnabled} onSwitch={toggleLock} />
          {settings.lockEnabled ? <Row icon="form-textbox-password" title="Change PIN" onPress={() => setSettingPin(true)} /> : null}
          {settings.lockEnabled && bio ? (
            <Row icon="fingerprint" title="Unlock with fingerprint / face" switchValue={settings.biometric} onSwitch={(v) => update({ biometric: v })} />
          ) : null}
        </Group>

        <Group title="Ads & privacy">
          {ready ? (
            <Row
              icon="gift-outline"
              title={adFree ? 'Ad-free is on' : 'Go ad-free for 1 hour'}
              text={adFree ? `${adFreeMinutes} min left` : `Watch ${ADS_REQUIRED} short ads`}
              onPress={adFree ? undefined : askAdFree}
            />
          ) : null}
          {privacyOptionsRequired ? <Row icon="shield-account-outline" title="Ad privacy choices" onPress={showPrivacyOptions} /> : null}
          {PRIVACY_POLICY_URL ? <Row icon="file-document-outline" title="Privacy policy" onPress={() => openUrl(PRIVACY_POLICY_URL)} /> : null}
        </Group>

        <Group title="About">
          <Row icon="star-outline" title="Rate Hive File Manager" text="Enjoying the app? A 5-star rating helps a lot" onPress={() => {
              suppressAppOpen();
              Linking.openURL(`market://details?id=${PACKAGE}`).catch(() => openUrl(STORE_URL));
            }}
          />
          <Row
            icon="share-variant-outline"
            title="Share with friends"
            onPress={() => {
              suppressAppOpen();
              Share.share({ message: `Try Hive File Manager – fast & simple file manager: ${STORE_URL}` }).catch(() => {});
            }}
          />
          <Row icon="information-outline" title="Version" value={VERSION} />
        </Group>
      </ScrollView>

      <Modal visible={settingPin} animationType="slide" statusBarTranslucent onRequestClose={() => setSettingPin(false)}>
        <LockScreen
          mode="set"
          onCancel={() => setSettingPin(false)}
          onSet={(pin) => {
            update({ pin, lockEnabled: true });
            setSettingPin(false);
            ui.toast('App lock is on');
          }}
        />
      </Modal>
    </View>
  );
}

function Group({ title, children }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={[styles.groupTitle, { color: t.brand }]}>{title}</Text>
      <View style={[styles.group, { backgroundColor: t.card }]}>{children}</View>
    </View>
  );
}

function Row({ icon, title, text, value, onPress, switchValue, onSwitch }) {
  const t = useTheme();
  const isSwitch = typeof switchValue === 'boolean';
  return (
    <Pressable
      onPress={isSwitch ? () => onSwitch(!switchValue) : onPress}
      disabled={!isSwitch && !onPress}
      android_ripple={{ color: t.selected }}
      style={styles.row}
    >
      <View style={[styles.rowIcon, { backgroundColor: t.selected }]}>
        <Icon name={icon} size={20} color={t.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: t.text }]}>{title}</Text>
        {text ? <Text style={[styles.rowText, { color: t.sub }]}>{text}</Text> : null}
      </View>
      {isSwitch ? (
        <Switch value={switchValue} onValueChange={onSwitch} trackColor={{ true: t.brand, false: t.border }} thumbColor="#fff" />
      ) : value ? (
        <Text style={[styles.rowValue, { color: t.sub }]}>{value}</Text>
      ) : onPress ? (
        <Icon name="chevron-right" size={22} color={t.faint} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  groupTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginLeft: 6 },
  group: { borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowText: { fontSize: 12, marginTop: 2 },
  rowValue: { fontSize: 14, marginLeft: 8 },
});
