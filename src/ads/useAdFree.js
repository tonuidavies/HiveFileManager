import { useCallback } from 'react';
import { useUI } from '../components/Overlays';
import { ADS_REQUIRED, getRewardProgress, watchOneForAdFree } from './AdManager';
import { useT } from '../i18n';

/**
 * Shared "Go ad-free for 1 hour" flow (used by Home and Settings).
 * The user must watch ADS_REQUIRED short ads; we ask before every next ad so they can stop anytime.
 */
export function useAdFreeFlow() {
  const ui = useUI();
  const tx = useT();
  return useCallback(async () => {
    const already = getRewardProgress();
    const ok = await ui.confirm({
      title: tx('adfree_title'),
      message:
        tx('adfree_msg', { count: ADS_REQUIRED }) +
        (already ? `\n\n${tx('adfree_already', { done: already, count: ADS_REQUIRED })}` : ''),
      confirmText: already ? tx('continue') : tx('start'),
      cancelText: tx('no_thanks'),
      icon: 'gift-outline',
    });
    if (!ok) return;
    for (;;) {
      const r = await watchOneForAdFree();
      if (r.result === 'unavailable') {
        ui.toast(r.watched ? tx('no_ad_partial', { done: r.watched, count: ADS_REQUIRED }) : tx('no_ad'));
        return;
      }
      if (r.result === 'skipped') {
        ui.toast(tx('watch_to_end'));
        return;
      }
      if (r.done) {
        ui.toast(tx('adfree_enjoy'));
        return;
      }
      const more = await ui.confirm({
        title: tx('n_of_m_watched', { done: r.watched, count: ADS_REQUIRED }),
        message: tx('n_more', { n: ADS_REQUIRED - r.watched }),
        confirmText: tx('next_ad'),
        cancelText: tx('later'),
        icon: 'gift-outline',
      });
      if (!more) return;
    }
  }, [ui, tx]);
}
