import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, type AppSettings } from './appSettings';
import { setHapticsEnabled } from './haptics';
import { setSoundsEnabled } from './sounds';
import { loadJSON, saveJSON, STORAGE_KEYS } from './storage';
import { cleanSettings } from './validate';

// The record's shape is declared in `appSettings.ts`, which stays free of React
// Native so the tests can import it; everything that reads settings still
// imports from here.
export { DEFAULT_SETTINGS } from './appSettings';
export type { AppSettings, BoardTheme, ColorSchemeSetting, PieceStyle, ReduceMotionSetting } from './appSettings';

const KEY = STORAGE_KEYS.appsettings;

interface SettingsContextValue {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  loaded: boolean;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  loaded: false,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Clamped on the way in: an unknown boardTheme or colorScheme would make
    // the theme tables return undefined and throw on every render.
    loadJSON<unknown>(KEY, DEFAULT_SETTINGS).then((s) => {
      setSettings(cleanSettings(s, DEFAULT_SETTINGS));
      setLoaded(true);
    });
  }, []);

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveJSON(KEY, next);
      return next;
    });
  }, []);

  useEffect(() => setHapticsEnabled(settings.haptics), [settings.haptics]);
  useEffect(() => setSoundsEnabled(settings.sounds), [settings.sounds]);

  const value = useMemo(() => ({ settings, update, loaded }), [settings, update, loaded]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
