import AsyncStorage from '@react-native-async-storage/async-storage';
import mobileAds, {
  AdEventType,
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  AppOpenAd,
  InterstitialAd,
  MaxAdContentRating,
  RewardedAdEventType,
  RewardedInterstitialAd,
  TestIds,
} from 'react-native-google-mobile-ads';

// ---------------------------------------------------------------------------
// Ad unit IDs (test IDs are used automatically in development builds)
// ---------------------------------------------------------------------------
const PROD = {
  APP_OPEN: 'ca-app-pub-7561161015961675/8798754163',
  BANNER: 'ca-app-pub-7561161015961675/1365959236',
  INTERSTITIAL: 'ca-app-pub-7561161015961675/4109981571',
  NATIVE: 'ca-app-pub-7561161015961675/4007713097',
  REWARDED_INTERSTITIAL: 'ca-app-pub-7561161015961675/9322507507',
};

const TEST = {
  APP_OPEN: TestIds.APP_OPEN || 'ca-app-pub-3940256099942544/9257395921',
  BANNER: TestIds.ADAPTIVE_BANNER || TestIds.BANNER || 'ca-app-pub-3940256099942544/9214589741',
  INTERSTITIAL: TestIds.INTERSTITIAL || 'ca-app-pub-3940256099942544/1033173712',
  NATIVE: TestIds.NATIVE || 'ca-app-pub-3940256099942544/2247696110',
  REWARDED_INTERSTITIAL: TestIds.REWARDED_INTERSTITIAL || 'ca-app-pub-3940256099942544/5354046379',
};

export const AD_UNITS = __DEV__ ? TEST : PROD;

// ---------------------------------------------------------------------------
// Frequency rules (kept user-friendly: better ratings = more installs = more revenue)
// ---------------------------------------------------------------------------
const RULES = {
  firstFullscreenAfterMs: 45 * 1000, // no interstitial in the first 45s of a session
  minGapMs: 80 * 1000, // at least 80s between any two full-screen ads
  navEvery: 6, // folder/category opens before an interstitial is considered
  appOpenMinBackgroundMs: 30 * 1000, // app must be in background >= 30s to show app open on return
  appOpenExpiryMs: 4 * 60 * 60 * 1000, // Google: app open ads expire after 4 hours
  adFreeRewardMs: 60 * 60 * 1000, // reward: 1 hour without ads
  adsRequired: 3, // rewarded ads to watch to earn the ad-free hour
  progressKeepMs: 15 * 60 * 1000, // partial progress is kept this long
};

export const ADS_REQUIRED = RULES.adsRequired;

const AD_FREE_KEY = '@hive_ad_free_until';
const LAUNCH_KEY = '@hive_launch_count';

const state = {
  ready: false,
  initStarted: false,
  privacyOptionsRequired: false,
  adFreeUntil: 0,
  sessionStart: Date.now(),
  lastFullscreenAt: 0,
  navCount: 0,
  fullscreenShowing: false,
  suppressAppOpenUntil: 0,
  launchCount: 0,
};

const listeners = new Set();
const emit = () => listeners.forEach((l) => l(getAdState()));

export function subscribeAds(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getAdState() {
  return {
    ready: state.ready,
    adFree: isAdFree(),
    adFreeUntil: state.adFreeUntil,
    privacyOptionsRequired: state.privacyOptionsRequired,
  };
}

export const isAdFree = () => Date.now() < state.adFreeUntil;
export const adsReady = () => state.ready && !isAdFree();

/** Call before opening another app / system screen so returning doesn't trigger an app-open ad. */
export function suppressAppOpen(ms = 60 * 1000) {
  state.suppressAppOpenUntil = Date.now() + ms;
}

// ---------------------------------------------------------------------------
// Init: consent first (GDPR / UMP), then SDK
// ---------------------------------------------------------------------------
export async function initAds() {
  if (state.initStarted) return;
  state.initStarted = true;
  try {
    const [until, launches] = await Promise.all([AsyncStorage.getItem(AD_FREE_KEY), AsyncStorage.getItem(LAUNCH_KEY)]);
    state.adFreeUntil = Number(until) || 0;
    if (isAdFree()) setTimeout(emit, state.adFreeUntil - Date.now() + 1000);
    state.launchCount = (Number(launches) || 0) + 1;
    AsyncStorage.setItem(LAUNCH_KEY, String(state.launchCount)).catch(() => {});
  } catch {}

  let canRequestAds = true;
  try {
    const info = await AdsConsent.gatherConsent();
    canRequestAds = info?.canRequestAds !== false;
  } catch {
    try {
      const info = await AdsConsent.getConsentInfo();
      canRequestAds = info?.canRequestAds !== false;
    } catch {}
  }
  try {
    const info = await AdsConsent.getConsentInfo();
    const REQUIRED = (AdsConsentPrivacyOptionsRequirementStatus && AdsConsentPrivacyOptionsRequirementStatus.REQUIRED) || 'REQUIRED';
    state.privacyOptionsRequired = info?.privacyOptionsRequirementStatus === REQUIRED;
  } catch {}

  if (!canRequestAds) {
    emit();
    return;
  }
  try {
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.PG,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
  } catch {}
  try {
    await mobileAds().initialize();
  } catch {}
  state.ready = true;
  emit();
  loadInterstitial();
  loadAppOpen();
  loadRewarded();
}

export async function showPrivacyOptions() {
  try {
    await AdsConsent.showPrivacyOptionsForm();
  } catch {}
}

const REQUEST = { keywords: ['file manager', 'storage', 'phone cleaner', 'productivity'] };

const retryDelay = (attempt) => Math.min(120000, 15000 * Math.pow(2, attempt));

// ---------------------------------------------------------------------------
// Interstitial
// ---------------------------------------------------------------------------
let interstitial = null;
let interLoaded = false;
let interLoading = false;
let interAttempts = 0;

function loadInterstitial() {
  if (!state.ready || interLoading || interLoaded) return;
  interLoading = true;
  if (!interstitial) {
    interstitial = InterstitialAd.createForAdRequest(AD_UNITS.INTERSTITIAL, REQUEST);
    interstitial.addAdEventListener(AdEventType.LOADED, () => {
      interLoaded = true;
      interLoading = false;
      interAttempts = 0;
    });
    interstitial.addAdEventListener(AdEventType.ERROR, () => {
      interLoaded = false;
      interLoading = false;
      setTimeout(loadInterstitial, retryDelay(interAttempts++));
    });
    interstitial.addAdEventListener(AdEventType.OPENED, () => {
      state.fullscreenShowing = true;
    });
    interstitial.addAdEventListener(AdEventType.CLICKED, () => suppressAppOpen());
    interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      state.fullscreenShowing = false;
      state.lastFullscreenAt = Date.now();
      interLoaded = false;
      loadInterstitial();
    });
  }
  try {
    interstitial.load();
  } catch {
    interLoading = false;
  }
}

function fullscreenAllowed() {
  const now = Date.now();
  return (
    adsReady() &&
    !state.fullscreenShowing &&
    now - state.sessionStart >= RULES.firstFullscreenAfterMs &&
    now - state.lastFullscreenAt >= RULES.minGapMs
  );
}

function showInterstitialNow() {
  if (!interLoaded || !interstitial) {
    loadInterstitial();
    return false;
  }
  try {
    interLoaded = false;
    interstitial.show();
    state.lastFullscreenAt = Date.now();
    return true;
  } catch {
    loadInterstitial();
    return false;
  }
}

/** Natural break: called when the user opens folders / categories. */
export function onNavigate() {
  state.navCount += 1;
  if (state.navCount >= RULES.navEvery && fullscreenAllowed()) {
    if (showInterstitialNow()) state.navCount = 0;
  }
}

/** Natural break: called after a finished task (copy, move, delete, clean, zip). */
export function onTaskCompleted() {
  if (fullscreenAllowed()) {
    if (showInterstitialNow()) state.navCount = 0;
  }
}

// ---------------------------------------------------------------------------
// App open
// ---------------------------------------------------------------------------
let appOpen = null;
let appOpenLoaded = false;
let appOpenLoading = false;
let appOpenLoadedAt = 0;
let appOpenAttempts = 0;
let pendingColdStart = false;

function loadAppOpen() {
  if (!state.ready || appOpenLoading) return;
  if (appOpenLoaded && Date.now() - appOpenLoadedAt < RULES.appOpenExpiryMs) return;
  appOpenLoading = true;
  appOpenLoaded = false;
  if (!appOpen) {
    appOpen = AppOpenAd.createForAdRequest(AD_UNITS.APP_OPEN, REQUEST);
    appOpen.addAdEventListener(AdEventType.LOADED, () => {
      appOpenLoaded = true;
      appOpenLoading = false;
      appOpenLoadedAt = Date.now();
      appOpenAttempts = 0;
      if (pendingColdStart) {
        pendingColdStart = false;
        showAppOpen();
      }
    });
    appOpen.addAdEventListener(AdEventType.ERROR, () => {
      appOpenLoaded = false;
      appOpenLoading = false;
      pendingColdStart = false;
      setTimeout(loadAppOpen, retryDelay(appOpenAttempts++));
    });
    appOpen.addAdEventListener(AdEventType.OPENED, () => {
      state.fullscreenShowing = true;
    });
    appOpen.addAdEventListener(AdEventType.CLICKED, () => suppressAppOpen());
    appOpen.addAdEventListener(AdEventType.CLOSED, () => {
      state.fullscreenShowing = false;
      state.lastFullscreenAt = Date.now();
      appOpenLoaded = false;
      loadAppOpen();
    });
  }
  try {
    appOpen.load();
  } catch {
    appOpenLoading = false;
  }
}

function showAppOpen() {
  if (!adsReady() || state.fullscreenShowing) return false;
  if (Date.now() < state.suppressAppOpenUntil) return false;
  if (!appOpenLoaded || Date.now() - appOpenLoadedAt > RULES.appOpenExpiryMs) {
    loadAppOpen();
    return false;
  }
  try {
    appOpenLoaded = false;
    appOpen.show();
    state.lastFullscreenAt = Date.now();
    return true;
  } catch {
    loadAppOpen();
    return false;
  }
}

/**
 * Cold start: show app-open ad only for returning users (never on the very first launch),
 * and only if it is ready within a few seconds, so the user is never kept waiting.
 */
export function onColdStartReady() {
  if (state.launchCount <= 1) return;
  if (showAppOpen()) return;
  pendingColdStart = true;
  setTimeout(() => {
    pendingColdStart = false;
  }, 4000);
}

/** App returned from background. */
export function onAppForeground(backgroundMs) {
  if (backgroundMs < RULES.appOpenMinBackgroundMs) return;
  if (Date.now() - state.lastFullscreenAt < 30 * 1000) return;
  showAppOpen();
}

// ---------------------------------------------------------------------------
// Rewarded interstitial: "Go ad-free for 1 hour"
// ---------------------------------------------------------------------------
let rewarded = null;
let rewardedLoaded = false;
let rewardedLoading = false;
let rewardWaiters = [];
let rewardEarned = false;
let rewardDone = null;

function loadRewarded() {
  if (!state.ready || rewardedLoading || rewardedLoaded) return;
  rewardedLoading = true;
  if (!rewarded) {
    rewarded = RewardedInterstitialAd.createForAdRequest(AD_UNITS.REWARDED_INTERSTITIAL, REQUEST);
    const onLoaded = () => {
      rewardedLoaded = true;
      rewardedLoading = false;
      rewardWaiters.forEach((w) => w(true));
      rewardWaiters = [];
    };
    rewarded.addAdEventListener(RewardedAdEventType.LOADED, onLoaded);
    rewarded.addAdEventListener(AdEventType.ERROR, () => {
      rewardedLoaded = false;
      rewardedLoading = false;
      rewardWaiters.forEach((w) => w(false));
      rewardWaiters = [];
    });
    rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      rewardEarned = true;
    });
    rewarded.addAdEventListener(AdEventType.OPENED, () => {
      state.fullscreenShowing = true;
    });
    rewarded.addAdEventListener(AdEventType.CLICKED, () => suppressAppOpen());
    rewarded.addAdEventListener(AdEventType.CLOSED, () => {
      state.fullscreenShowing = false;
      state.lastFullscreenAt = Date.now();
      rewardedLoaded = false;
      const earned = rewardEarned;
      rewardEarned = false;
      if (rewardDone) {
        rewardDone(earned);
        rewardDone = null;
      }
      loadRewarded();
    });
  }
  try {
    rewarded.load();
  } catch {
    rewardedLoading = false;
  }
}

function grantAdFree() {
  state.adFreeUntil = Date.now() + RULES.adFreeRewardMs;
  AsyncStorage.setItem(AD_FREE_KEY, String(state.adFreeUntil)).catch(() => {});
  emit();
  setTimeout(emit, RULES.adFreeRewardMs + 1000);
}

function waitForRewarded(timeoutMs) {
  if (rewardedLoaded) return Promise.resolve(true);
  loadRewarded();
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), timeoutMs);
    rewardWaiters.push((ok) => {
      clearTimeout(t);
      resolve(ok);
    });
  });
}

let rewardProgress = 0;
let rewardProgressAt = 0;

/** How many ads of the required set were already watched (expires after a while). */
export function getRewardProgress() {
  if (rewardProgress > 0 && Date.now() - rewardProgressAt > RULES.progressKeepMs) rewardProgress = 0;
  return rewardProgress;
}

function showOneRewarded() {
  return new Promise((resolve) => {
    rewardDone = (earned) => resolve(earned ? 'earned' : 'skipped');
    try {
      rewardedLoaded = false;
      rewarded.show();
    } catch {
      rewardDone = null;
      resolve('unavailable');
    }
  });
}

/**
 * Shows ONE rewarded ad toward the ad-free hour. Call only after the user opted in (AdMob policy).
 * Resolves { result: 'earned' | 'skipped' | 'unavailable', watched, done }.
 * `done` becomes true when the required number of ads has been watched; ad-free is then granted.
 */
export async function watchOneForAdFree() {
  if (!state.ready) return { result: 'unavailable', watched: getRewardProgress(), done: false };
  const ok = await waitForRewarded(8000);
  if (!ok || !rewarded) return { result: 'unavailable', watched: getRewardProgress(), done: false };
  const result = await showOneRewarded();
  if (result !== 'earned') return { result, watched: getRewardProgress(), done: false };
  rewardProgress = getRewardProgress() + 1;
  rewardProgressAt = Date.now();
  if (rewardProgress >= RULES.adsRequired) {
    rewardProgress = 0;
    grantAdFree();
    return { result, watched: RULES.adsRequired, done: true };
  }
  return { result, watched: rewardProgress, done: false };
}
