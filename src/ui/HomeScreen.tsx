import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Difficulty } from '../engine/ai';
import type { CheatLevel } from '../engine/cheat';
import type { MaterialMode } from '../engine/setup';
import { ARMY_SIZES, type ArmySize, type GameConfig, type GameMode, type PlayAs, type Stats } from '../game/config';
import { todayKey, type DailyState } from '../game/daily';
import { useSettings, type BoardTheme, type ColorSchemeSetting, type PieceStyle } from '../settings';
import { Button, Card, Label, Segmented } from './components';
import { BOARD_THEMES } from './theme';
import { CHESS_FONT } from './PieceGlyph';
import { themedStyles, useTheme } from './theme';

interface Props {
  config: GameConfig;
  onChange: (c: GameConfig) => void;
  onStart: () => void;
  onDaily: () => void;
  daily: DailyState;
  onResume?: () => void;
  onRules: () => void;
  stats: Stats;
}

const CHEAT_HINT: Record<CheatLevel, string> = {
  off: 'The computer plays by the rules.',
  low: 'Now and then the computer slips in an illegal move. Catch it to undo it and move twice.',
  high: 'The computer cheats whenever it thinks it can get away with it.',
};

const MATERIAL_HINT: Record<MaterialMode, string> = {
  fair: 'Different random armies, roughly equal in strength.',
  mirror: 'Both sides get the same random set of pieces.',
  chaos: 'Fully random on both sides. Someone may get three queens.',
};

export function HomeScreen({ config, onChange, onStart, onDaily, daily, onResume, onRules, stats }: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const set = <K extends keyof GameConfig>(key: K, value: GameConfig[K]) => onChange({ ...config, [key]: value });
  const size = ARMY_SIZES[config.armySize];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.hero}>
        <Text style={styles.kings}>♚♚</Text>
        <Text style={styles.title}>Two Kings Chess</Text>
        <Text style={styles.tagline}>
          Regular chess, two twists: every side has two kings, and every army is randomly generated.
        </Text>
      </View>

      {onResume && <Button title="Resume game" onPress={onResume} style={styles.resume} />}

      <DailyCard daily={daily} onDaily={onDaily} />

      <Card>
        <Label>Opponent</Label>
        <Segmented<GameMode>
          value={config.mode}
          onChange={(v) => set('mode', v)}
          options={[
            { value: 'ai', label: 'Computer' },
            { value: 'local', label: 'Pass & play' },
          ]}
        />

        {config.mode === 'ai' && (
          <>
            <Label>Difficulty</Label>
            <Segmented<Difficulty>
              value={config.difficulty}
              onChange={(v) => set('difficulty', v)}
              options={[
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
              ]}
            />
            <Label>Play as</Label>
            <Segmented<PlayAs>
              value={config.playAs}
              onChange={(v) => set('playAs', v)}
              options={[
                { value: 'w', label: 'White' },
                { value: 'b', label: 'Black' },
                { value: 'random', label: 'Random' },
              ]}
            />
            <Label hint={CHEAT_HINT[config.cheating]}>Computer cheats</Label>
            <Segmented<CheatLevel>
              value={config.cheating}
              onChange={(v) => set('cheating', v)}
              options={[
                { value: 'off', label: 'Never' },
                { value: 'low', label: 'Sometimes' },
                { value: 'high', label: 'Often' },
              ]}
            />
          </>
        )}

        <Label hint={MATERIAL_HINT[config.material]}>Armies</Label>
        <Segmented<MaterialMode>
          value={config.material}
          onChange={(v) => set('material', v)}
          options={[
            { value: 'fair', label: 'Fair' },
            { value: 'mirror', label: 'Mirror' },
            { value: 'chaos', label: 'Chaos' },
          ]}
        />

        <Label hint={`${size.min}–${size.max} pieces per side, two of them kings.`}>Army size</Label>
        <Segmented<ArmySize>
          value={config.armySize}
          onChange={(v) => set('armySize', v)}
          options={(Object.keys(ARMY_SIZES) as ArmySize[]).map((k) => ({ value: k, label: ARMY_SIZES[k].label }))}
        />
      </Card>

      <Card>
        <Label>Appearance</Label>
        <Segmented<ColorSchemeSetting>
          value={settings.colorScheme}
          onChange={(v) => update({ colorScheme: v })}
          options={[
            { value: 'system', label: 'System' },
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
        <Label>Board</Label>
        <Segmented<BoardTheme>
          value={settings.boardTheme}
          onChange={(v) => update({ boardTheme: v })}
          options={(Object.keys(BOARD_THEMES) as BoardTheme[]).map((k) => ({ value: k, label: BOARD_THEMES[k].label }))}
        />
        <Label>Pieces</Label>
        <Segmented<PieceStyle>
          value={settings.pieceStyle}
          onChange={(v) => update({ pieceStyle: v })}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'classic', label: 'Classic print' },
          ]}
        />
        <Label>Feedback</Label>
        <Segmented<'both' | 'haptics' | 'sounds' | 'none'>
          value={settings.sounds && settings.haptics ? 'both' : settings.haptics ? 'haptics' : settings.sounds ? 'sounds' : 'none'}
          onChange={(v) => update({ sounds: v === 'both' || v === 'sounds', haptics: v === 'both' || v === 'haptics' })}
          options={[
            { value: 'both', label: 'Both' },
            { value: 'haptics', label: 'Haptics' },
            { value: 'sounds', label: 'Sound' },
            { value: 'none', label: 'Off' },
          ]}
        />
      </Card>

      <Button title="New game" onPress={onStart} style={styles.start} />
      <Button title="How to play" variant="secondary" onPress={onRules} />

      <Text style={styles.stats}>
        Versus computer: {stats.wins} W · {stats.losses} L · {stats.draws} D
      </Text>
    </ScrollView>
  );
}

function DailyCard({ daily, onDaily }: { daily: DailyState; onDaily: () => void }) {
  const styles = useStyles();
  const today = todayKey();
  const rec = daily.results[today];
  const label = rec
    ? rec.outcome === 'win'
      ? `Won today in ${rec.moves} moves 🏆`
      : rec.outcome === 'loss'
        ? `Lost today after ${rec.moves} moves`
        : `Drew today after ${rec.moves} moves`
    : 'Same armies for everyone, once a day. Fair, medium, occasional cheating.';
  const streak = daily.lastPlayed === today || daily.streak > 0 ? daily.streak : 0;
  return (
    <View style={styles.dailyCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.dailyTitle}>Daily challenge · {today}</Text>
        <Text style={styles.dailyText}>{label}</Text>
        {streak > 1 && <Text style={styles.dailyStreak}>🔥 {streak}-day streak</Text>}
      </View>
      <Button title={rec ? 'Replay' : 'Play'} small onPress={onDaily} variant={rec ? 'secondary' : 'primary'} />
    </View>
  );
}

const useStyles = themedStyles((theme) => ({
  dailyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.accent,
  },
  dailyTitle: { color: theme.text, fontWeight: '800', fontSize: 14 },
  dailyText: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  dailyStreak: { color: theme.accent, fontSize: 12, marginTop: 2, fontWeight: '700' },
  root: { flex: 1, backgroundColor: theme.bg },
  content: { paddingHorizontal: 16, gap: 12 },
  hero: { alignItems: 'center', marginBottom: 8 },
  kings: { fontSize: 56, color: theme.accent, lineHeight: 66, fontFamily: CHESS_FONT },
  title: { color: theme.text, fontSize: 30, fontWeight: '800', marginTop: 4 },
  tagline: { color: theme.textMuted, textAlign: 'center', marginTop: 8, fontSize: 14, lineHeight: 20, maxWidth: 340 },
  resume: { marginBottom: 4 },
  start: { marginTop: 8 },
  stats: { color: theme.textMuted, textAlign: 'center', marginTop: 12, fontSize: 13 },
}));
