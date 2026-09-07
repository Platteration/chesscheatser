import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setHapticsEnabled } from './haptics';
import { loadJSON, saveJSON } from './storage';

export type ColorSchemeSetting = 'system' | 'dark' | 'light';
export type BoardTheme = 'wood' | 'marble' | 'slate' | 'neon' | 'tournament';
export type PieceStyle = 'solid' | 'classic';

export interface AppSettings {
  colorScheme: ColorSchemeSetting;
  boardTheme: BoardTheme;
  pieceStyle: PieceStyle;
  sounds: boolean;
  haptics: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  colorScheme: 'system',
  boardTheme: 'wood',
  pieceStyle: 'solid',
  sounds: true,
  haptics: true,
};

const KEY = 'twokings.appsettings.v1';

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
    loadJSON<AppSettings>(KEY, DEFAULT_SETTINGS).then((s) => {
      setSettings(s);
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

  const value = useMemo(() => ({ settings, update, loaded }), [settings, update, loaded]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
