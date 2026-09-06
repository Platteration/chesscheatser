import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DEFAULT_CONFIG, EMPTY_STATS, type GameConfig, type SavedGame, type Stats } from './src/game/config';
import type { StartOptions } from './src/game/useGame';
import { loadJSON, remove, saveJSON, STORAGE_KEYS } from './src/storage';
import { GameScreen } from './src/ui/GameScreen';
import { HomeScreen } from './src/ui/HomeScreen';
import { RulesScreen } from './src/ui/RulesScreen';
import { theme } from './src/ui/theme';

type Screen = { name: 'home' } | { name: 'rules' } | { name: 'game'; start: StartOptions; key: number };

export default function App() {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState<SavedGame | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  useEffect(() => {
    (async () => {
      const [cfg, game, st] = await Promise.all([
        loadJSON<GameConfig>(STORAGE_KEYS.settings, DEFAULT_CONFIG),
        loadJSON<SavedGame | null>(STORAGE_KEYS.game, null),
        loadJSON<Stats>(STORAGE_KEYS.stats, EMPTY_STATS),
      ]);
      setConfig(cfg);
      setSaved(game && Array.isArray(game.moves) && typeof game.seed === 'number' ? game : null);
      setStats(st);
      setReady(true);
    })();
  }, []);

  const updateConfig = useCallback((c: GameConfig) => {
    setConfig(c);
    void saveJSON(STORAGE_KEYS.settings, c);
  }, []);

  const onSave = useCallback((game: SavedGame | null) => {
    setSaved(game);
    if (game) void saveJSON(STORAGE_KEYS.game, game);
    else void remove(STORAGE_KEYS.game);
  }, []);

  const onFinished = useCallback((outcome: 'win' | 'loss' | 'draw') => {
    setStats((s) => {
      const next = {
        wins: s.wins + (outcome === 'win' ? 1 : 0),
        losses: s.losses + (outcome === 'loss' ? 1 : 0),
        draws: s.draws + (outcome === 'draw' ? 1 : 0),
      };
      void saveJSON(STORAGE_KEYS.stats, next);
      return next;
    });
  }, []);

  const startNew = useCallback(() => {
    setScreen({ name: 'game', start: { config }, key: Date.now() });
  }, [config]);

  const resume = useCallback(() => {
    if (!saved) return;
    setScreen({
      name: 'game',
      start: { config: saved.config, seed: saved.seed, humanColor: saved.humanColor, moves: saved.moves },
      key: Date.now(),
    });
  }, [saved]);

  const goHome = useCallback(() => setScreen({ name: 'home' }), []);

  let content: React.ReactNode;
  if (!ready) {
    content = (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  } else if (screen.name === 'game') {
    content = <GameScreen key={screen.key} start={screen.start} onExit={goHome} onSave={onSave} onFinished={onFinished} />;
  } else if (screen.name === 'rules') {
    content = <RulesScreen onBack={goHome} />;
  } else {
    content = (
      <HomeScreen
        config={config}
        onChange={updateConfig}
        onStart={startNew}
        onResume={saved ? resume : undefined}
        onRules={() => setScreen({ name: 'rules' })}
        stats={stats}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        {content}
        <StatusBar style="light" />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
