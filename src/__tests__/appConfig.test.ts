/**
 * What app.json asks the operating systems for, and the posture it shares with
 * the sibling apps: every key this file pins is stated in app.json, even at its
 * default, so the two say the same thing. The config plugins fill in their own
 * defaults for anything left out, so an omission there becomes a permission in
 * the shipped build that nothing in the app ever uses — and the only place that
 * shows up is a prebuild, which no other suite runs.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../appSettings';

const root = fileURLToPath(new URL('../../', import.meta.url));
const nodeRequire = createRequire(import.meta.url);

const appConfig = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'));
const themeSource = readFileSync(join(root, 'src/ui/theme.ts'), 'utf8');

type Attrs = Record<string, string | undefined>;
interface XmlNode {
  $: Attrs;
  _?: string;
}
interface Introspected {
  sdkVersion?: string;
  _internal: {
    modResults: {
      android: {
        manifest: { manifest: { 'uses-permission': XmlNode[]; application: XmlNode[] } };
        colors: { resources: { color: XmlNode[] } };
      };
      ios: { infoPlist: Record<string, unknown>; splashScreenStoryboard?: unknown };
    };
  };
}

/**
 * The native projects a prebuild would generate: `expo config --type
 * introspect` runs the same plugin chain, so this is the merged result rather
 * than the app.json that feeds it. The template's own permissions only exist
 * here — app.json never mentions them.
 */
const introspected: Introspected = JSON.parse(
  execFileSync(
    'node',
    [nodeRequire.resolve('expo/bin/cli'), 'config', '--type', 'introspect', '--json'],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' },
    },
  ),
);
const manifest = introspected._internal.modResults.android.manifest.manifest;

/** The Android permissions a module the app actually uses declares. */
const USED = [
  'android.permission.VIBRATE', // expo-haptics
  'android.permission.MODIFY_AUDIO_SETTINGS', // expo-audio: the move and capture sounds
];
// Not in USED: INTERNET. A development build needs it to load its bundle and
// nothing else here ever opens a socket, so it is blocked in the config and
// added back to the debug source set alone — see plugins/withDebugInternet.js
// and the test at the bottom of this file.
const INTERNET = 'android.permission.INTERNET';
const BLOCKED = [
  INTERNET,
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  // The bare template's "display over other apps" overlay, for the dev menu,
  // which it writes into the main manifest. A shipped game has no reason to
  // draw over other apps, and the template's debug source set declares it
  // again (see the fixture at the bottom), so a dev client loses nothing.
  'android.permission.SYSTEM_ALERT_WINDOW',
];

/**
 * Every AndroidManifest.xml under `dir`. `isDirectory()` is false for a
 * symlink, so a linked package — and any cycle through one — is left alone.
 */
const manifestsUnder = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...manifestsUnder(full));
    else if (entry.isFile() && entry.name === 'AndroidManifest.xml') out.push(full);
  }
  return out;
};

/** The app's own source, joined: src/ without its tests, plus the two root files. */
const appSource = (): string => {
  const sources: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        sources.push(readFileSync(full, 'utf8'));
      }
    }
  };
  walk(join(root, 'src'));
  for (const file of ['App.tsx', 'index.ts']) sources.push(readFileSync(join(root, file), 'utf8'));
  return sources.join('\n');
};

const pluginOptions = (name: string): Record<string, unknown> => {
  const entry = appConfig.plugins.find((p: unknown) => (Array.isArray(p) ? p[0] : p) === name);
  expect(entry).toBeDefined();
  return Array.isArray(entry) ? entry[1] || {} : {};
};

describe('app.json states the posture it shares with the sibling apps', () => {
  it('runs on the SDK these rules are written for', () => {
    // The dead-key and pin rules below are SDK 57's; on a bump, re-derive them
    // from @expo/config-types rather than deleting whichever fails.
    expect(introspected.sdkVersion).toMatch(/^57\./);
    expect(pkg.dependencies.expo).toMatch(/^~57\./);
  });

  it('configures the splash screen through the expo-splash-screen plugin', () => {
    // SDK 57 removed the top-level `splash` block (only `web.splash` is read),
    // and expo-splash-screen's plugin does nothing without props
    // (plugin/build/withSplashScreen.js). A top-level block is silently
    // ignored, so it is gone rather than left beside the plugin to disagree.
    expect(appConfig.splash).toBeUndefined();
    expect(pluginOptions('expo-splash-screen')).toEqual({
      image: './assets/splash-icon.png',
      imageWidth: 200,
      resizeMode: 'contain',
      backgroundColor: '#15161a',
    });
    expect(existsSync(join(root, 'assets/splash-icon.png'))).toBe(true);
    expect(pkg.dependencies['expo-splash-screen']).toMatch(/^~57\./);
    // ...and the plugin ran: the colour reached the Android resources and iOS
    // got its storyboard. A listed plugin whose package is missing does neither.
    const colors = introspected._internal.modResults.android.colors.resources.color;
    expect(colors.find((c) => c.$.name === 'splashscreen_background')?._).toBe('#15161a');
    expect(introspected._internal.modResults.ios.splashScreenStoryboard).toBeDefined();
  });

  it('installs expo-system-ui, without which the interface style never reaches Android', () => {
    // The schema says so (ExpoConfig.d.ts, userInterfaceStyle): on Android the
    // value is applied by expo-system-ui at runtime, so app.json alone leaves
    // the System appearance option a no-op there (REVIEW.md, UX-1).
    expect(pkg.dependencies['expo-system-ui']).toMatch(/^~57\./);
    // Evidence the package resolves rather than merely being listed: the
    // prebuild's expo-system-ui plugin only writes `backgroundColor` to the
    // iOS root view when it finds the module installed.
    expect(introspected._internal.modResults.ios.infoPlist.RCTRootViewBackgroundColor).toBeDefined();
  });

  it('carries no keys SDK 57 no longer reads', () => {
    // `newArchEnabled` has no reader left in @expo/cli, config-plugins or
    // prebuild-config, and `android.edgeToEdgeEnabled` is gone from the schema
    // with prebuild warning that Android 16 makes edge-to-edge mandatory. A key
    // nothing reads still looks like a decision to the next person.
    expect(appConfig.newArchEnabled).toBeUndefined();
    expect(appConfig.android.edgeToEdgeEnabled).toBeUndefined();
  });

  it('pins its defaults explicitly', () => {
    expect(appConfig.android.predictiveBackGestureEnabled).toBe(false);
    expect(appConfig.ios.supportsTablet).toBe(true);
    expect(appConfig.web.bundler).toBe('metro');
    expect(appConfig.orientation).toBe('default'); // the board rotates with the phone
  });

  it('has no URL scheme, because nothing handles a URL', () => {
    // A scheme registers the app for links; the app has no router and never
    // reads one. The check is against the source, so adding Linking is the
    // moment to decide about a scheme rather than a surprise later.
    expect(appConfig.scheme).toBeUndefined();
    expect(appSource()).not.toMatch(/\bLinking\b/);
  });

  it('ships the adaptive icon as its three assets', () => {
    const icon = appConfig.android.adaptiveIcon;
    for (const key of ['foregroundImage', 'backgroundImage', 'monochromeImage']) {
      expect(typeof icon[key]).toBe('string');
      expect(existsSync(join(root, icon[key]))).toBe(true);
    }
    expect(icon.backgroundColor).toBe(appConfig.backgroundColor);
  });

  it('matches the shared eas.json shape', () => {
    expect(eas.cli).toEqual({ version: '>= 16.0.0', appVersionSource: 'remote' });
    expect(eas.build.development).toMatchObject({ developmentClient: true, distribution: 'internal' });
    expect(eas.build.preview).toMatchObject({ distribution: 'internal', android: { buildType: 'apk' } });
    expect(eas.build.production.autoIncrement).toBe(true);
  });
});

describe('appearance configuration', () => {
  it('still ships "system" as the default appearance', () => {
    expect(DEFAULT_SETTINGS.colorScheme).toBe('system');
  });

  it('resolves the "system" appearance from the device colour scheme', () => {
    expect(themeSource).toMatch(/useColorScheme\(\)/);
  });

  it('does not pin the native interface style, or "system" can never be light', () => {
    // Expo writes userInterfaceStyle to UIUserInterfaceStyle (iOS) and night
    // mode (Android). Pinning it to a scheme forces the trait collection, so
    // React Native's useColorScheme() reports that scheme whatever the phone is
    // set to, and the System appearance option silently does nothing.
    expect(appConfig.userInterfaceStyle).toBe('automatic');
  });
});

describe('what Android grants', () => {
  it("keeps the player's record in Android backup", () => {
    // @expo/config-plugins defaults allowBackup to true over the bare
    // template's false; it is stated in app.json so the file and this test
    // agree. The value is true because the store is the player's own record —
    // daily streak, ladder, puzzle progress and the Pro entitlement
    // (STORAGE_KEYS and KEPT_ON_CLEAR in src/storage.ts) — and there is no
    // server copy: PRIVACY.md says the app makes no network requests. Losing
    // them on a device migration is worse than the privacy gain, and what a
    // restore can plant is bounded by src/validate.ts, which every stored
    // record goes through before it is used.
    expect(appConfig.android.allowBackup).toBe(true);
    expect(manifest.application[0].$['android:allowBackup']).toBe('true');
  });

  it('grants nothing in the generated manifest the app does not use', () => {
    // The prebuild template adds permissions of its own (legacy storage, the
    // overlay) that nothing here ever asked for, and blockedPermissions is
    // the only thing that takes one back out.
    const declared = manifest['uses-permission']
      .filter((p) => p.$['tools:node'] !== 'remove')
      .map((p) => p.$['android:name']);
    expect(declared.length).toBeGreaterThan(0); // the introspection found a manifest at all
    expect(declared.filter((name) => !USED.includes(name!))).toEqual([]);
  });

  it("takes the template's and the modules' permissions out of the merged manifest", () => {
    // The template grants legacy external storage and the overlay to every
    // app, and a module manifest may bring the media-read set: a
    // `tools:node="remove"` entry is what stops the Gradle merge from keeping
    // any of them. The three READ_MEDIA_*
    // entries are removed although nothing declares them today, which is the
    // point — a module added tomorrow does not get to widen the build.
    expect(appConfig.android.blockedPermissions).toEqual(BLOCKED);
    for (const name of BLOCKED) {
      const entry = manifest['uses-permission'].find((p) => p.$['android:name'] === name);
      expect(entry, name).toBeDefined();
      expect(entry!.$['tools:node'], name).toBe('remove');
    }
  });

  it('blocks every permission a bundled native module merges in', () => {
    // The generated manifest is only half of it: each native module ships an
    // AndroidManifest.xml that Gradle folds in at build time, which no plugin
    // option touches. expo-file-system, which expo itself depends on, declares
    // INTERNET and both legacy storage permissions for an app that reads
    // nothing but its own bundle.
    //
    // Every manifest in the tree is read rather than the ones at a guessed
    // path: a scoped package is not a top-level directory name, react-native
    // keeps its own under ReactAndroid/src/debug, and expo nests its
    // expo-file-system under its own node_modules here.
    const files = manifestsUnder(join(root, 'node_modules'));
    const declaredBy = new Map<string, string[]>(); // permission -> the manifests declaring it
    for (const file of files) {
      const xml = readFileSync(file, 'utf8');
      for (const m of xml.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g)) {
        declaredBy.set(m[1], [...(declaredBy.get(m[1]) || []), relative(root, file)]);
      }
    }

    // The scan found the module manifests, and reaches the three kinds a name
    // filter misses: a scoped package, react-native's own, and a source set
    // that is not src/main.
    const seen = files.map((f) => relative(join(root, 'node_modules'), f));
    expect(seen.length).toBeGreaterThan(10);
    expect(declaredBy.size).toBeGreaterThan(0);
    expect(seen.some((f) => f.startsWith('react-native/'))).toBe(true);
    expect(seen.some((f) => f.startsWith('@'))).toBe(true);
    expect(seen.some((f) => f.includes(`src${sep}debug${sep}`))).toBe(true);

    const blocked: string[] = appConfig.android.blockedPermissions || [];
    const unblocked = [...declaredBy]
      .filter(([name]) => !USED.includes(name) && !blocked.includes(name))
      .map(([name, where]) => `${name} (${where.join(', ')})`);
    expect(unblocked).toEqual([]);
  });
});

describe('what leaves the device', () => {
  it('has no network code', () => {
    // The reason INTERNET can be blocked, checked against the source rather
    // than assumed. The one thing that leaves the app is `Share.share` in
    // GameScreen, which hands text to the operating system's share sheet and
    // needs no permission of its own.
    expect(appSource()).not.toMatch(
      /fetch\(|XMLHttpRequest|WebSocket|axios|openURL|openBrowserAsync|expo-updates/,
    );
  });

  it('does not ship network access', () => {
    // PRIVACY.md's argument that nothing leaves the device is that the app has
    // no network code; INTERNET in the shipped manifest is what turns a
    // malicious dependency or in-process code execution from 'reads the
    // player's record' into 'sends it somewhere'. The template and
    // expo-file-system both declare it, so it has to be blocked rather than
    // merely not asked for.
    const internet = manifest['uses-permission'].find((p) => p.$['android:name'] === INTERNET);
    expect(internet).toBeDefined(); // it is in the merge, and being removed
    expect(internet!.$['tools:node']).toBe('remove');
  });

  it('gives a development build the network back, in the debug source set only', async () => {
    // Blocking it outright would stop a dev client loading its bundle. The
    // manifest merger gives a build-type source set higher priority than the
    // main manifest, so the permission is added to android/app/src/debug —
    // the same split React Native's own template uses for its debug-only
    // SYSTEM_ALERT_WINDOW. The release variant never reads that file.
    expect(appConfig.plugins).toContain('./plugins/withDebugInternet');

    interface DebugInternetPlugin {
      (config: Record<string, unknown>): {
        mods: { android: { dangerous: (config: Record<string, unknown>) => Promise<unknown> } };
      };
      addInternetPermission(xml: string): string;
      writeDebugManifest(platformProjectRoot: string): string;
      DEBUG_MANIFEST: string;
    }
    const plugin = nodeRequire('../../plugins/withDebugInternet') as DebugInternetPlugin;
    const dir = mkdtempSync(join(tmpdir(), 'two-kings-prebuild-'));
    try {
      // What expo-template-bare-minimum@57.0.26 (the sdk-57 dist-tag) puts
      // there, verbatim; 57.0.22, which node_modules/expo/template.tgz holds,
      // has the same text.
      const template = [
        '<manifest xmlns:android="http://schemas.android.com/apk/res/android"',
        '    xmlns:tools="http://schemas.android.com/tools">',
        '',
        '    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>',
        '',
        '    <application android:usesCleartextTraffic="true" tools:targetApi="28" tools:ignore="GoogleAppIndexingWarning" tools:replace="android:usesCleartextTraffic" />',
        '</manifest>',
        '',
      ].join('\n');
      const file = join(dir, plugin.DEBUG_MANIFEST);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, template);

      const config = plugin({ name: 'Two Kings Chess', slug: 'two-kings-chess' });
      expect(typeof config.mods.android.dangerous).toBe('function');
      await config.mods.android.dangerous({
        ...config,
        modRequest: { platformProjectRoot: dir },
      });

      const written = readFileSync(file, 'utf8');
      expect(written).toMatch(/<uses-permission[^>]*android:name="android\.permission\.INTERNET"/);
      // ...without dropping what the template had there.
      expect(written).toContain('android.permission.SYSTEM_ALERT_WINDOW');
      expect(written).toContain('tools:replace="android:usesCleartextTraffic"');
      // ...and running it again changes nothing.
      expect(plugin.addInternetPermission(written)).toBe(written);
      // A project whose template wrote no debug manifest gets one.
      const fresh = join(dir, 'fresh');
      expect(readFileSync(plugin.writeDebugManifest(fresh), 'utf8')).toContain(
        'android.permission.INTERNET',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
