import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DEFAULT_CONFIG, EMPTY_STATS, type GameConfig, type SavedGame, type Stats } from './src/game/config';
import { DAILY_CONFIG, dailySeed, EMPTY_DAILY, recordDaily, todayKey, type DailyState } from './src/game/daily';
import { applyLadderResult, EMPTY_LADDER, ladderConfig, ladderParams, type LadderState } from './src/game/ladder';
import { EMPTY_PUZZLE_PROGRESS, loadPuzzles, type PuzzleProgress } from './src/game/puzzles';
import { PuzzleScreen } from './src/ui/PuzzleScreen';
import type { StartOptions } from './src/game/useGame';
import { loadJSON, remove, saveJSON, STORAGE_KEYS } from './src/storage';
import { applyOutcome, type GameOutcome } from './src/game/flow';
import { cleanConfig, cleanSavedGame } from './src/validate';
import { GameScreen } from './src/ui/GameScreen';
import { HomeScreen } from './src/ui/HomeScreen';
import { RulesScreen } from './src/ui/RulesScreen';
import { EntitlementsProvider, mockStore } from './src/entitlements';
import { SettingsProvider, useSettings } from './src/settings';
import { ProScreen } from './src/ui/ProScreen';
import { StatsScreen } from './src/ui/StatsScreen';
import { theme as staticTheme, useTheme } from './src/ui/theme';

type Screen =
  | { name: 'home' }
  | { name: 'rules' }
  | { name: 'puzzles' }
  | { name: 'pro' }
  | { name: 'stats' }
  | { name: 'game'; start: StartOptions; key: number };

const PUZZLES = loadPuzzles();

export default function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <EntitlementsProvider store={mockStore}>
          <SafeAreaProvider>
            <Root />
          </SafeAreaProvider>
        </EntitlementsProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}

/**
 * Without this, one throw during render takes the whole app down: a blank page
 * on the web build, a crash on device, and no way back because the record that
 * caused it is still stored. Several throw sites run during render (the setup
 * builder and the event fold both run inside hooks), so the recovery offered
 * here is the one that fixes those: drop the saved game and start over.
 * Deliberately dependency-free, and it uses the static theme because the
 * providers it wraps may be exactly what failed.
 */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  reset = () => {
    void remove(STORAGE_KEYS.game);
    this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
  };

  render() {
    if (!this.state.failed) return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
    return (
      <View style={[styles.failed, { backgroundColor: staticTheme.bg }]}>
        <Text style={[styles.failedTitle, { color: staticTheme.text }]}>Something went wrong</Text>
        <Text style={[styles.failedText, { color: staticTheme.textMuted }]}>
          The game could not be shown. Starting a new game clears the game in progress and returns to the menu.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={this.reset}
          style={({ pressed }) => [styles.failedButton, { backgroundColor: staticTheme.accent, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.failedButtonText, { color: staticTheme.accentText }]}>Start a new game</Text>
        </Pressable>
      </View>
    );
  }
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
  const [puzzleProgress, setPuzzleProgress] = useState<PuzzleProgress>(EMPTY_PUZZLE_PROGRESS);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  useEffect(() => {
    (async () => {
      const [cfg, game, st, dy, ld, pz] = await Promise.all([
        loadJSON<unknown>(STORAGE_KEYS.settings, DEFAULT_CONFIG),
        loadJSON<unknown>(STORAGE_KEYS.game, null),
        loadJSON<Stats>(STORAGE_KEYS.stats, EMPTY_STATS),
        loadJSON<DailyState>(STORAGE_KEYS.daily, EMPTY_DAILY),
        loadJSON<LadderState>(STORAGE_KEYS.ladder, EMPTY_LADDER),
        loadJSON<PuzzleProgress>(STORAGE_KEYS.puzzles, EMPTY_PUZZLE_PROGRESS),
      ]);
      setDaily(dy);
      setLadder(ld);
      setPuzzleProgress(pz);
      setConfig(cleanConfig(cfg));
      // A record that cannot be replayed is dropped rather than left to crash
      // Resume on this launch and every launch after it.
      const resumable = cleanSavedGame(game);
      if (!resumable && game) void remove(STORAGE_KEYS.game);
      setSaved(resumable);
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
      const next = applyOutcome(s, o);
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
        handicap: saved.handicap ?? (saved.ranked ? ladderParams(saved.ranked).handicap : undefined),
        clocks: saved.clocks,
      },
      key: Date.now(),
    });
  }, [saved]);

  const goHome = useCallback(() => setScreen({ name: 'home' }), []);

  // Android's back gesture has no router to fall back on: without this it
  // finishes the activity, so back on any screen closes the app.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen.name === 'home') return false; // let the system close the app
      setScreen({ name: 'home' });
      return true;
    });
    return () => sub.remove();
  }, [screen.name]);

  const onPuzzleSolved = useCallback((id: string) => {
    setPuzzleProgress((p) => {
      if (p.solved.includes(id)) return p;
      const next = { solved: [...p.solved, id] };
      void saveJSON(STORAGE_KEYS.puzzles, next);
      return next;
    });
  }, []);

  let content: React.ReactNode;
  if (!ready || !settingsLoaded || (!fontsLoaded && !fontError)) {
    content = (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  } else if (screen.name === 'game') {
    content = (
      <GameScreen
        key={screen.key}
        start={screen.start}
        onExit={goHome}
        onSave={onSave}
        onFinished={onFinished}
        dailyStreak={daily.streak}
        onPro={() => setScreen({ name: 'pro' })}
      />
    );
  } else if (screen.name === 'rules') {
    content = <RulesScreen onBack={goHome} />;
  } else if (screen.name === 'stats') {
    content = (
      <StatsScreen stats={stats} daily={daily} ladder={ladder} puzzlesSolved={puzzleProgress.solved.length} puzzleCount={PUZZLES.length} onBack={goHome} />
    );
  } else if (screen.name === 'pro') {
    content = <ProScreen onBack={goHome} />;
  } else if (screen.name === 'puzzles') {
    content = <PuzzleScreen puzzles={PUZZLES} progress={puzzleProgress} onSolved={onPuzzleSolved} onBack={goHome} />;
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
        onPuzzles={() => setScreen({ name: 'puzzles' })}
        onPro={() => setScreen({ name: 'pro' })}
        onStats={() => setScreen({ name: 'stats' })}
        puzzlesSolved={puzzleProgress.solved.length}
        puzzleCount={PUZZLES.length}
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
  failed: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  failedTitle: { fontSize: 20, fontWeight: '800' },
  failedText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  failedButton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  failedButtonText: { fontWeight: '700' },
});
