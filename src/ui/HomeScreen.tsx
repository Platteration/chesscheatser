import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Difficulty } from '../engine/ai';
import type { CheatLevel } from '../engine/cheat';
import type { MaterialMode } from '../engine/setup';
import { ARMY_SIZES, type ArmySize, type GameConfig, type GameMode, type PlayAs, type Stats } from '../game/config';
import { Button, Card, Label, Segmented } from './components';
import { theme } from './theme';

interface Props {
  config: GameConfig;
  onChange: (c: GameConfig) => void;
  onStart: () => void;
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

export function HomeScreen({ config, onChange, onStart, onResume, onRules, stats }: Props) {
  const insets = useSafeAreaInsets();
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

      <Button title="New game" onPress={onStart} style={styles.start} />
      <Button title="How to play" variant="secondary" onPress={onRules} />

      <Text style={styles.stats}>
        Versus computer: {stats.wins} W · {stats.losses} L · {stats.draws} D
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { paddingHorizontal: 16, gap: 12 },
  hero: { alignItems: 'center', marginBottom: 8 },
  kings: { fontSize: 56, color: theme.accent, lineHeight: 66 },
  title: { color: theme.text, fontSize: 30, fontWeight: '800', marginTop: 4 },
  tagline: { color: theme.textMuted, textAlign: 'center', marginTop: 8, fontSize: 14, lineHeight: 20, maxWidth: 340 },
  resume: { marginBottom: 4 },
  start: { marginTop: 8 },
  stats: { color: theme.textMuted, textAlign: 'center', marginTop: 12, fontSize: 13 },
});
