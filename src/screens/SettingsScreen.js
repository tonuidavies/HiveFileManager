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
import { LANGUAGES, resolveLanguage, useT } from '../i18n';
import appJson from '../../app.json';

// Put your privacy policy link here (required by Google Play for apps with ads)
export const PRIVACY_POLICY_URL = 'https://app.notion.com/p/Policy-document-Hive-Manager-34a704888c2d80dc8989c89645caae6b';

const PACKAGE = appJson.expo?.android?.package || '';
const VERSION = appJson.expo?.version || '';
const STORE_URL = `https://play.google.com/store/apps/details?id=${PACKAGE}`;

export default function SettingsScreen() {
  const t = useTheme();
  const tx = useT();
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

  const themeLabel = { system: tx('system_default'), light: tx('light'), dark: tx('dark') }[settings.themeMode];
  const langName = (code) => LANGUAGES.find((l) => l.code === code)?.name || code;
  const languageLabel = settings.language === 'system' ? `${tx('system_default')} (${langName(resolveLanguage('system'))})` : langName(settings.language);

  const chooseLanguage = () =>
    ui.sheet({
      title: tx('language'),
      actions: [
        { label: `${tx('system_default')} (${langName(resolveLanguage('system'))})`, icon: 'translate', checked: settings.language === 'system', onPress: () => update({ language: 'system' }) },
        ...LANGUAGES.map((l) => ({ label: l.name, icon: 'alphabetical-variant', checked: settings.language === l.code, onPress: () => update({ language: l.code }) })),
      ],
    });

  const chooseTheme = () =>
    ui.sheet({
      title: tx('theme'),
      actions: [
        { label: tx('system_default'), icon: 'theme-light-dark', checked: settings.themeMode === 'system', onPress: () => update({ themeMode: 'system' }) },
        { label: tx('light'), icon: 'white-balance-sunny', checked: settings.themeMode === 'light', onPress: () => update({ themeMode: 'light' }) },
        { label: tx('dark'), icon: 'weather-night', checked: settings.themeMode === 'dark', onPress: () => update({ themeMode: 'dark' }) },
      ],
    });

  const toggleLock = async (on) => {
    if (on) {
      setSettingPin(true);
      return;
    }
    const ok = await ui.confirm({ title: tx('app_lock_off_q'), message: tx('app_lock_off_msg'), confirmText: tx('turn_off'), destructive: true });
    if (ok) {
      update({ lockEnabled: false, pin: null });
      ui.toast(tx('app_lock_off_toast'));
    }
  };

  const adFreeMinutes = adFree ? Math.max(1, Math.round((adFreeUntil - Date.now()) / 60000)) : 0;

  const askAdFree = useAdFreeFlow();

  const openUrl = (url) => {
    suppressAppOpen();
    Linking.openURL(url).catch(() => ui.toast(tx('could_not_open_link')));
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <GradientHeader title={tx('settings')} left={<IconButton name="arrow-left" color="#fff" onPress={() => nav.pop()} />} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Group title={tx('appearance')}>
          <Row icon="palette-outline" title={tx('theme')} value={themeLabel} onPress={chooseTheme} />
          <Row icon="translate" title={tx('language')} value={languageLabel} onPress={chooseLanguage} />
          <Row
            icon={settings.viewMode === 'grid' ? 'view-grid-outline' : 'view-list-outline'}
            title={tx('default_view')}
            value={settings.viewMode === 'grid' ? tx('grid') : tx('list')}
            onPress={() => update({ viewMode: settings.viewMode === 'grid' ? 'list' : 'grid' })}
          />
        </Group>

        <Group title={tx('files')}>
          <Row icon="eye-outline" title={tx('show_hidden_files')} text={tx('show_hidden_text')} switchValue={settings.showHidden} onSwitch={(v) => update({ showHidden: v })} />
          <Row icon="trash-can-outline" title={tx('use_trash')} text={tx('use_trash_text')} switchValue={settings.useTrash} onSwitch={(v) => update({ useTrash: v })} />
          <Row icon="help-circle-outline" title={tx('confirm_delete')} switchValue={settings.confirmDelete} onSwitch={(v) => update({ confirmDelete: v })} />
          <Row icon="delete-restore" title={tx('open_trash')} onPress={() => nav.push('trash', {})} />
        </Group>

        <Group title={tx('security')}>
          <Row icon="lock-outline" title={tx('app_lock')} text={tx('app_lock_text')} switchValue={settings.lockEnabled} onSwitch={toggleLock} />
          {settings.lockEnabled ? <Row icon="form-textbox-password" title={tx('change_pin')} onPress={() => setSettingPin(true)} /> : null}
          {settings.lockEnabled && bio ? (
            <Row icon="fingerprint" title={tx('unlock_bio')} switchValue={settings.biometric} onSwitch={(v) => update({ biometric: v })} />
          ) : null}
        </Group>

        <Group title={tx('ads_privacy')}>
          {ready ? (
            <Row
              icon="gift-outline"
              title={adFree ? tx('adfree_on') : tx('adfree_go')}
              text={adFree ? tx('min_left', { count: adFreeMinutes }) : tx('watch_n_ads', { count: ADS_REQUIRED })}
              onPress={adFree ? undefined : askAdFree}
            />
          ) : null}
          {privacyOptionsRequired ? <Row icon="shield-account-outline" title={tx('ad_privacy_choices')} onPress={showPrivacyOptions} /> : null}
          {PRIVACY_POLICY_URL ? <Row icon="file-document-outline" title={tx('privacy_policy')} onPress={() => openUrl(PRIVACY_POLICY_URL)} /> : null}
        </Group>

        <Group title={tx('about')}>
          <Row icon="star-outline" title={tx('rate_app')} text={tx('rate_text')} onPress={() => {
              suppressAppOpen();
              Linking.openURL(`market://details?id=${PACKAGE}`).catch(() => openUrl(STORE_URL));
            }}
          />
          <Row
            icon="share-variant-outline"
            title={tx('share_friends')}
            onPress={() => {
              suppressAppOpen();
              Share.share({ message: tx('share_message', { url: STORE_URL }) }).catch(() => {});
            }}
          />
          <Row icon="information-outline" title={tx('version')} value={VERSION} />
        </Group>
      </ScrollView>

      <Modal visible={settingPin} animationType="slide" statusBarTranslucent onRequestClose={() => setSettingPin(false)}>
        <LockScreen
          mode="set"
          onCancel={() => setSettingPin(false)}
          onSet={(pin) => {
            update({ pin, lockEnabled: true });
            setSettingPin(false);
            ui.toast(tx('app_lock_on_toast'));
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
