// Re-applies Google Play vitals fixes on every `expo prebuild` (incl. --clean).
// 1) R8 minify/obfuscation for release  2) keep rules  3) no deprecated statusBarColor
// 4) no orientation lock + resize-friendly configChanges
const {
  withGradleProperties,
  withDangerousMod,
  withAndroidStyles,
  withAndroidManifest,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const KEEP_RULES = `
# >>> play-vitals keep rules (managed by plugins/withPlayVitalsFixes.js)
-keep class expo.modules.hivestorage.** { *; }
-keep class expo.modules.** { *; }
-keep class * extends expo.modules.kotlin.modules.Module { *; }
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keepclassmembers class * { @com.facebook.react.bridge.ReactMethod *; }
-keepclassmembers class * { @com.facebook.proguard.annotations.DoNotStrip *; }
-keep class io.invertase.googlemobileads.** { *; }
-keep class com.google.android.gms.ads.** { *; }
-dontwarn com.google.android.gms.**
-keep class com.reactnativecommunity.asyncstorage.** { *; }
-keep class kotlin.Metadata { *; }
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
# <<< play-vitals keep rules
`;

function setProp(props, key, value) {
  const i = props.findIndex((p) => p.type === 'property' && p.key === key);
  if (i >= 0) props[i].value = value;
  else props.push({ type: 'property', key, value });
}

module.exports = function withPlayVitalsFixes(config) {
  config = withGradleProperties(config, (c) => {
    setProp(c.modResults, 'android.enableMinifyInReleaseBuilds', 'true');
    return c;
  });

  config = withDangerousMod(config, ['android', (c) => {
    const file = path.join(c.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
    let s = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    s = s.replace(/\n# >>> play-vitals[\s\S]*?# <<< play-vitals keep rules\n/, '');
    if (!s.includes('expo.modules.hivestorage')) s += KEEP_RULES;
    fs.writeFileSync(file, s);
    return c;
  }]);

  config = withAndroidStyles(config, (c) => {
    for (const style of c.modResults.resources.style || []) {
      if (style.item) style.item = style.item.filter((it) => it.$.name !== 'android:statusBarColor');
    }
    return c;
  });

  config = withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application?.[0];
    for (const act of app?.activity || []) {
      if (act.$['android:name'] !== '.MainActivity') continue;
      delete act.$['android:screenOrientation'];
      act.$['android:resizeableActivity'] = 'true';
      const changes = new Set((act.$['android:configChanges'] || '').split('|').filter(Boolean));
      ['orientation', 'screenSize', 'smallestScreenSize', 'screenLayout', 'density', 'uiMode']
        .forEach((x) => changes.add(x));
      act.$['android:configChanges'] = [...changes].join('|');
    }
    return c;
  });

  return config;
};
