import React, { memo, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { NativeAd, NativeAdView, NativeAsset, NativeAssetType, NativeMediaView } from 'react-native-google-mobile-ads';
import { AD_UNITS } from './AdManager';
import { useAdState } from './useAds';
import { radius, useTheme } from '../theme';

/**
 * Native ad styled like the app's own cards, with a clear "Ad" label (required by AdMob).
 * Renders nothing if no ad is available, so it never leaves an empty gap.
 */
function NativeAdCard({ style, showMedia = true }) {
  const t = useTheme();
  const { ready, adFree } = useAdState();
  const [ad, setAd] = useState(null);

  useEffect(() => {
    if (!ready || adFree) return undefined;
    let alive = true;
    let loadedAd = null;
    NativeAd.createForAdRequest(AD_UNITS.NATIVE, { startVideoMuted: true })
      .then((a) => {
        if (!alive) {
          a.destroy();
          return;
        }
        loadedAd = a;
        setAd(a);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (loadedAd) loadedAd.destroy();
    };
  }, [ready, adFree]);

  if (!ready || adFree || !ad) return null;

  return (
    <NativeAdView nativeAd={ad} style={[styles.card, { backgroundColor: t.card, borderColor: t.border }, style]}>
      <View style={styles.row}>
        {ad.icon?.url ? (
          <NativeAsset assetType={NativeAssetType.ICON}>
            <Image source={{ uri: ad.icon.url }} style={styles.icon} />
          </NativeAsset>
        ) : null}
        <View style={styles.texts}>
          <View style={styles.titleRow}>
            <View style={[styles.badge, { backgroundColor: t.folder }]}>
              <Text style={styles.badgeText}>Ad</Text>
            </View>
            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <Text style={[styles.headline, { color: t.text }]} numberOfLines={1}>
                {ad.headline}
              </Text>
            </NativeAsset>
          </View>
          {ad.advertiser ? (
            <NativeAsset assetType={NativeAssetType.ADVERTISER}>
              <Text style={[styles.advertiser, { color: t.sub }]} numberOfLines={1}>
                {ad.advertiser}
              </Text>
            </NativeAsset>
          ) : null}
        </View>
      </View>
      {ad.body ? (
        <NativeAsset assetType={NativeAssetType.BODY}>
          <Text style={[styles.body, { color: t.sub }]} numberOfLines={2}>
            {ad.body}
          </Text>
        </NativeAsset>
      ) : null}
      {showMedia ? <NativeMediaView style={styles.media} resizeMode="cover" /> : null}
      {ad.callToAction ? (
        <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
          <Text style={[styles.cta, { backgroundColor: t.brand }]}>{ad.callToAction}</Text>
        </NativeAsset>
      ) : null}
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 44, height: 44, borderRadius: 10, marginRight: 12 },
  texts: { flex: 1, paddingRight: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  badge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginRight: 6 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  headline: { fontSize: 15, fontWeight: '700', flex: 1 },
  advertiser: { fontSize: 12, marginTop: 2 },
  body: { fontSize: 13, marginTop: 10, lineHeight: 18 },
  media: { width: '100%', aspectRatio: 1.91, borderRadius: 12, marginTop: 10, overflow: 'hidden' },
  cta: {
    marginTop: 12,
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    overflow: 'hidden',
    fontSize: 14,
  },
});

export default memo(NativeAdCard);
