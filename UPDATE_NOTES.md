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
