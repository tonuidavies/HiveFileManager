import React, { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { AD_UNITS } from './AdManager';
import { useAdState } from './useAds';
import { useTheme } from '../theme';

/** Anchored adaptive banner. Takes no space until an ad is loaded (no empty grey box). */
function BannerSlot() {
  const t = useTheme();
  const { ready, adFree } = useAdState();
  const [loaded, setLoaded] = useState(false);
  if (!ready || adFree) return null;
  return (
    <View style={[styles.wrap, loaded && { backgroundColor: t.card, borderTopColor: t.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
      <BannerAd
        unitId={AD_UNITS.BANNER}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={() => setLoaded(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignItems: 'center' },
});

export default memo(BannerSlot);
