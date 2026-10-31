# Hive File Manager 2.0 – update notes

## Before building
1. Install the new packages (this also refreshes `package-lock.json`, which EAS needs):
   ```
   npm install
   ```
2. Rebuild the app. This version includes native code (`modules/hive-storage`), so Expo Go won't work:
   ```
   npx expo run:android            (local)
   eas build -p android --profile production
   ```

## Google Play: "All files access" declaration (required)
The app now uses `MANAGE_EXTERNAL_STORAGE` ("All files access"), the same permission top file managers use.
In Play Console → App content → **Permissions declaration (All files access)**:
- Core feature: **File manager**
- Description: "Hive File Manager lets users browse, copy, move, rename, compress, extract, clean up and delete files and folders anywhere on their device storage."
- Add a short video showing: the "Allow access" screen → granting access → browsing folders and managing files.

## AdMob
- Turn on a GDPR consent message: AdMob → Privacy & messaging → European regulations. The app shows it automatically.
- Add your privacy policy link in `src/screens/SettingsScreen.js` (`PRIVACY_POLICY_URL`) and in Play Console.
- Development builds use Google test ads automatically. Release builds use your real ad units.

## Where things are
- `App.js` – startup, app lock, permission check, screen stack
- `src/screens/` – Home, Browser, Categories, Search, Cleaner, Trash, Settings, Viewer, Editor, Lock, Permission
- `src/ads/` – all ad formats and frequency rules (`AdManager.js` → `RULES`)
- `modules/hive-storage/` – fast native file access (Kotlin)

---

# 3.1.0 – what changed

## Play Console: "DEX code optimization is below our threshold" (Obfuscation 0%)
R8 was already switched on, but the keep rules in `plugins/withPlayVitalsFixes.js` / `android/app/proguard-rules.pro`
kept whole libraries (`com.facebook.react.**`, `expo.modules.**`, AdMob, AsyncStorage…), so almost nothing was obfuscated.
Those blanket rules are gone; only `expo.modules.hivestorage.**` (our own native module) is kept. Resource shrinking is on too.
After uploading the new release, Play Console needs a day or two to re-measure.
**Smoke-test a release build** (`eas build -p android --profile production`, install the AAB/APK) before publishing:
open folders, copy/zip/unzip, trash, app lock, ads, duplicate finder.
If something crashes only in release, run `adb logcat | findstr "ClassNotFound NoSuchMethod"` and add a narrow
`-keep class <that.class> { *; }` rule to both files above.

## Duplicate finder
- New screen (Home → "Duplicates", or Cleaner → "Find duplicate files").
- Scans Photos / Videos / Audio / Documents / Archives & APKs; files are matched by size → quick hash → full SHA-1, so only byte-identical files are listed.
- Keeps the oldest copy of every set by default (menu: keep newest / clear selection). At least one copy of each set can never be deleted.
- Deleted copies go to Trash when "Use Trash" is on (restorable for 30 days), otherwise they are deleted permanently.
- Needs the new native file `modules/hive-storage/android/src/main/java/expo/modules/hivestorage/HiveDuplicatesModule.kt`
  (registered in `modules/hive-storage/expo-module.config.json`) → **rebuild the native app** (`npx expo run:android` / EAS build).

## Localization
- English, Español, Français, Português, Deutsch, Русский, हिन्दी, Bahasa Indonesia, Kiswahili.
- Follows the phone language; override in Settings → Appearance → Language.
- Strings live in `src/i18n/locales/*.js` (English is the source). To add a language: copy `en.js`, translate, then register it in `src/i18n/index.js` (`DICTS` + `LANGUAGES`).
- Plural forms use `key_one` / `key_other` (and `_few` / `_many` for Russian) with `t(key, { count })`.
- Right-to-left languages (Arabic, Hebrew) are not included: they need RTL layout testing first.
