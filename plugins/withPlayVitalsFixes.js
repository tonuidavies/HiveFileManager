// Re-applies Google Play vitals fixes on every `expo prebuild` (incl. --clean).
// 1) R8 minify/obfuscation + resource shrinking for release  2) minimal keep rules (so code really is obfuscated)  3) no deprecated statusBarColor
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
# Keep only what this app itself needs. React Native, Hermes, Expo modules, AdMob / Google Play services
# and AsyncStorage ship their own consumer rules, so everything else is shrunk AND obfuscated by R8.
# (Blanket "-keep class com.facebook.react.** / expo.modules.** / gms.ads.**" rules disable obfuscation
#  for most of the app, which is what Play Console flagged as "Obfuscation 0%".)
-keep class expo.modules.hivestorage.** { *; }
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-dontwarn com.google.android.gms.**
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
    setProp(c.modResults, 'android.enableShrinkResourcesInReleaseBuilds', 'true');
    return c;
  });

  config = withDangerousMod(config, ['android', (c) => {
    const file = path.join(c.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
    let s = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    s = s.replace(/\n# >>> play-vitals[\s\S]*?# <<< play-vitals keep rules\n/, '');
    s += KEEP_RULES;
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
