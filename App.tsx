import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DEFAULT_CONFIG, EMPTY_STATS, type GameConfig, type SavedGame, type Stats } from './src/game/config';
import { DAILY_CONFIG, dailySeed, EMPTY_DAILY, recordDaily, todayKey, type DailyState } from './src/game/daily';
import { applyLadderResult, EMPTY_LADDER, ladderConfig, ladderParams, type LadderState } from './src/game/ladder';
import type { StartOptions } from './src/game/useGame';
import { loadJSON, remove, saveJSON, STORAGE_KEYS } from './src/storage';
import { GameScreen, type GameOutcome } from './src/ui/GameScreen';
import { HomeScreen } from './src/ui/HomeScreen';
import { RulesScreen } from './src/ui/RulesScreen';
import { SettingsProvider, useSettings } from './src/settings';
import { useTheme } from './src/ui/theme';

type Screen = { name: 'home' } | { name: 'rules' } | { name: 'game'; start: StartOptions; key: number };

export default function App() {
  return (
    <SettingsProvider>
      <SafeAreaProvider>
        <Root />
      </SafeAreaProvider>
    </SettingsProvider>
  );
}

function Root() {
  const theme = useTheme();
  const { loaded: settingsLoaded } = useSettings();
  const [ready, setReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({ ChessGlyphs: require('./assets/fonts/ChessGlyphs.ttf') });
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState<SavedGame | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [daily, setDaily] = useState<DailyState>(EMPTY_DAILY);
  const [ladder, setLadder] = useState<LadderState>(EMPTY_LADDER);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  useEffect(() => {
    (async () => {
      const [cfg, game, st, dy, ld] = await Promise.all([
        loadJSON<GameConfig>(STORAGE_KEYS.settings, DEFAULT_CONFIG),
        loadJSON<SavedGame | null>(STORAGE_KEYS.game, null),
        loadJSON<Stats>(STORAGE_KEYS.stats, EMPTY_STATS),
        loadJSON<DailyState>(STORAGE_KEYS.daily, EMPTY_DAILY),
        loadJSON<LadderState>(STORAGE_KEYS.ladder, EMPTY_LADDER),
      ]);
      setDaily(dy);
      setLadder(ld);
      setConfig(cfg);
      setSaved(game && Array.isArray(game.events) && typeof game.seed === 'number' ? game : null);
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

  const onFinished = useCallback((o: GameOutcome) => {
    setStats((s) => {
      const next = {
        wins: s.wins + (o.outcome === 'win' ? 1 : 0),
        losses: s.losses + (o.outcome === 'loss' ? 1 : 0),
        draws: s.draws + (o.outcome === 'draw' ? 1 : 0),
      };
      void saveJSON(STORAGE_KEYS.stats, next);
      return next;
    });
    if (o.ranked !== null) {
      setLadder((l) => {
        const next = applyLadderResult(l, o.outcome);
        void saveJSON(STORAGE_KEYS.ladder, next);
        return next;
      });
    }
    if (o.daily) {
      setDaily((d) => {
        const next = recordDaily(d, { date: o.daily!, ...o });
        void saveJSON(STORAGE_KEYS.daily, next);
        return next;
      });
    }
  }, []);

  const startRanked = useCallback(() => {
    const rank = ladder.rank;
    setScreen({
      name: 'game',
      start: { config: ladderConfig(rank), humanColor: 'w', ranked: rank, handicap: ladderParams(rank).handicap },
      key: Date.now(),
    });
  }, [ladder.rank]);

  const startDaily = useCallback(() => {
    const date = todayKey();
    setScreen({
      name: 'game',
      start: { config: DAILY_CONFIG, seed: dailySeed(date), humanColor: 'w', daily: date },
      key: Date.now(),
    });
  }, []);

  const startNew = useCallback(() => {
    setScreen({ name: 'game', start: { config }, key: Date.now() });
  }, [config]);

  const resume = useCallback(() => {
    if (!saved) return;
    setScreen({
      name: 'game',
      start: {
        config: saved.config,
        seed: saved.seed,
        humanColor: saved.humanColor,
        events: saved.events,
        daily: saved.daily,
        ranked: saved.ranked,
        handicap: saved.ranked ? ladderParams(saved.ranked).handicap : undefined,
      },
      key: Date.now(),
    });
  }, [saved]);

  const goHome = useCallback(() => setScreen({ name: 'home' }), []);

  let content: React.ReactNode;
  if (!ready || !settingsLoaded || (!fontsLoaded && !fontError)) {
    content = (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  } else if (screen.name === 'game') {
    content = (
      <GameScreen key={screen.key} start={screen.start} onExit={goHome} onSave={onSave} onFinished={onFinished} dailyStreak={daily.streak} />
    );
  } else if (screen.name === 'rules') {
    content = <RulesScreen onBack={goHome} />;
  } else {
    content = (
      <HomeScreen
        config={config}
        onChange={updateConfig}
        onStart={startNew}
        onDaily={startDaily}
        daily={daily}
        onRanked={startRanked}
        ladder={ladder}
        onResume={saved ? resume : undefined}
        onRules={() => setScreen({ name: 'rules' })}
        stats={stats}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      {content}
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
