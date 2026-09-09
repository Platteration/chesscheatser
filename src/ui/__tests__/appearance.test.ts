import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appConfig = JSON.parse(readFileSync(new URL('../../../app.json', import.meta.url), 'utf8'));
const settingsSource = readFileSync(new URL('../../settings.tsx', import.meta.url), 'utf8');
const themeSource = readFileSync(new URL('../theme.ts', import.meta.url), 'utf8');

describe('appearance configuration', () => {
  it('still ships "system" as the default appearance', () => {
    expect(settingsSource).toMatch(/colorScheme:\s*'system'/);
  });

  it('resolves the "system" appearance from the device colour scheme', () => {
    expect(themeSource).toMatch(/useColorScheme\(\)/);
  });

  it('does not pin the native interface style, or "system" can never be light', () => {
    // Expo writes userInterfaceStyle to UIUserInterfaceStyle (iOS) and night
    // mode (Android). Pinning it to a scheme forces the trait collection, so
    // React Native's useColorScheme() reports that scheme whatever the phone is
    // set to, and the System appearance option silently does nothing.
    expect(appConfig.expo.userInterfaceStyle).toBe('automatic');
  });
});
