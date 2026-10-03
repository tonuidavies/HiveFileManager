import { useCallback } from 'react';
import { useUI } from '../components/Overlays';
import { ADS_REQUIRED, getRewardProgress, watchOneForAdFree } from './AdManager';

/**
 * Shared "Go ad-free for 1 hour" flow (used by Home and Settings).
 * The user must watch ADS_REQUIRED short ads; we ask before every next ad so they can stop anytime.
 */
export function useAdFreeFlow() {
  const ui = useUI();
  return useCallback(async () => {
    const already = getRewardProgress();
    const ok = await ui.confirm({
      title: 'Go ad-free for 1 hour',
      message:
        `Watch ${ADS_REQUIRED} short video ads and Hive will hide all ads for 1 hour. You can stop anytime.` +
        (already ? `\n\nYou have already watched ${already} of ${ADS_REQUIRED}.` : ''),
      confirmText: already ? 'Continue' : 'Start',
      cancelText: 'No thanks',
      icon: 'gift-outline',
    });
    if (!ok) return;
    for (;;) {
      const r = await watchOneForAdFree();
      if (r.result === 'unavailable') {
        ui.toast(r.watched ? `No ad right now. ${r.watched} of ${ADS_REQUIRED} watched, try again soon.` : 'No ad available right now. Please try again later.');
        return;
      }
      if (r.result === 'skipped') {
        ui.toast('Watch the ad to the end for it to count.');
        return;
      }
      if (r.done) {
        ui.toast('Enjoy 1 hour without ads!');
        return;
      }
      const more = await ui.confirm({
        title: `${r.watched} of ${ADS_REQUIRED} watched`,
        message: `${ADS_REQUIRED - r.watched} more to go.`,
        confirmText: 'Next ad',
        cancelText: 'Later',
        icon: 'gift-outline',
      });
      if (!more) return;
    }
  }, [ui]);
}
