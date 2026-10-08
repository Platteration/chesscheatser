import React, { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Difficulty } from '../engine/ai';
import type { CheatLevel } from '../engine/cheat';
import type { MaterialMode } from '../engine/setup';
import { ARMY_SIZES, type ArmySize, type ClockMinutes, type GameConfig, type GameMode, type PlayAs, type Stats } from '../game/config';
import { liveStreak, todayKey, type DailyState } from '../game/daily';
import { ladderParams, type LadderState } from '../game/ladder';
import { cosmeticsOfKind, describeEarn, earnProgress, unlockedCosmetics, type Cosmetic, type Progress } from '../cosmetics';
import { useEntitlements } from '../entitlements';
import { APP_NAME, APP_VERSION, CHANGELOG_URL, PRIVACY_SENTENCE, PRIVACY_URL, SOURCE_URL } from '../about';
import { confirmAction } from '../confirm';
import { useSettings, type BoardTheme, type ColorSchemeSetting, type PieceStyle, type ReduceMotionSetting } from '../settings';
import { Button, Card, Label, Link, Segmented, SwitchRow } from './components';
import { BOARD_THEMES } from './theme';
import { CHESS_FONT } from './PieceGlyph';
import { themedStyles, useTheme } from './theme';

interface Props {
  config: GameConfig;
  onChange: (c: GameConfig) => void;
  onStart: () => void;
  onDaily: () => void;
  daily: DailyState;
  onRanked: () => void;
  ladder: LadderState;
  onResume?: () => void;
  /** Why the saved game is missing or shorter than it was, when there is something to say. */
  resumeNote?: string | null;
  onRules: () => void;
  onPuzzles: () => void;
  onPro: () => void;
  onStats: () => void;
  puzzlesSolved: number;
  puzzleCount: number;
  stats: Stats;
}

const CHEAT_HINT: Record<CheatLevel, string> = {
  off: 'The computer plays by the rules.',
  low: 'Now and then the computer slips in an illegal move. Catch it to undo it and move twice.',
  high: 'The computer cheats whenever it thinks it can get away with it.',
};

const KINGS_HINT: Record<number, string> = {
  2: 'The variant: two kings a side. You lose to a checkmate, or when every king is in check with no way out.',
  1: 'Handicap Chess: one king and ordinary chess rules, but keep the random armies and comeback powers.',
};

const MATERIAL_HINT: Record<MaterialMode, string> = {
  fair: 'Different random armies, roughly equal in strength.',
  mirror: 'Both sides get the same random set of pieces.',
  chaos: 'Fully random on both sides. Someone may get three queens.',
  handicap: 'Used by the ranked ladder.',
};

export function HomeScreen({ config, onChange, onStart, onDaily, daily, onRanked, ladder, onResume, resumeNote, onRules, onPuzzles, onPro, onStats, puzzlesSolved, puzzleCount, stats }: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, update, reset } = useSettings();
  // Confirmed because there is no undo: the record is overwritten in place.
  const onReset = () =>
    confirmAction({
      title: 'Reset settings?',
      message: 'Appearance, aura, board, pieces, sound, vibration and motion go back to their defaults. Your games, record, ladder rank, daily results, puzzle progress and purchases are not touched.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Reset',
      onConfirm: reset,
    });
  const { owned } = useEntitlements();
  const progress: Progress = useMemo(
    () => ({ stats, daily, ladder, puzzlesSolved }),
    [stats, daily, ladder, puzzlesSolved],
  );
  const unlocked = useMemo(() => unlockedCosmetics(progress, owned), [progress, owned]);
  // Name the nearest thing still locked, so the hint is a goal rather than an advert.
  const nextLocked = cosmeticsOfKind('aura')
    .concat(cosmeticsOfKind('board'), cosmeticsOfKind('pieces'))
    .find((c) => !unlocked.has(c.id) && c.earn);
  const lockedHint = nextLocked
    ? `${nextLocked.label}: ${describeEarn(nextLocked.earn!)} (${Math.min(
        earnProgress(nextLocked.earn!, progress).have,
        earnProgress(nextLocked.earn!, progress).need,
      )}/${earnProgress(nextLocked.earn!, progress).need}), or support the game.`
    : undefined;
  const label = (c: Cosmetic) => c.label + (unlocked.has(c.id) ? '' : ' 🔒');
  const set = <K extends keyof GameConfig>(key: K, value: GameConfig[K]) => onChange({ ...config, [key]: value });
  const size = ARMY_SIZES[config.armySize];
  const kings = config.kings ?? 2;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.hero}>
        <Text style={styles.kings}>♚♚</Text>
        <Text style={styles.title}>Two Kings Chess</Text>
        <Text style={styles.tagline}>
          Two kings a side, random armies, and the losing side's pieces grow stronger the further behind it falls.
        </Text>
      </View>

      {onResume && <Button title="Resume game" onPress={onResume} style={styles.resume} />}
      {/* A saved game that was dropped or clipped says so here, rather than just not being on the menu. */}
      {!!resumeNote && <Text style={styles.resumeNote}>{resumeNote}</Text>}

      <DailyCard daily={daily} onDaily={onDaily} />
      <LadderCard ladder={ladder} onRanked={onRanked} />

      <Button title={config.mode === 'ai' ? 'Play the computer' : 'Pass & play'} onPress={onStart} />
      <Text style={styles.summary}>{summarize(config)}</Text>

      <Card>
        <Text style={styles.cardTitle}>Game settings</Text>
        <Label>Opponent</Label>
        <Segmented<GameMode>
          value={config.mode}
          onChange={(v) => set('mode', v)}
          options={[
            { value: 'ai', label: 'Computer' },
            { value: 'local', label: 'Pass & play' },
          ]}
        />

        <Label hint={KINGS_HINT[kings]}>Kings</Label>
        <Segmented<string>
          value={String(kings)}
          onChange={(v) => set('kings', Number(v) as 1 | 2)}
          options={[
            { value: '2', label: 'Two (the variant)' },
            { value: '1', label: 'One (handicap)' },
          ]}
        />

        {kings > 1 && (
          <>
            <Label hint={config.doubleCheck === 'loses' ? 'Both kings in check at the start of your turn is an instant loss (short, brutal games).' : 'A double check must be answered: you lose only if no move leaves a king safe.'}>
              Double check
            </Label>
            <Segmented<'loses' | 'answer'>
              value={config.doubleCheck === 'loses' ? 'loses' : 'answer'}
              onChange={(v) => set('doubleCheck', v)}
              options={[
                { value: 'answer', label: 'Must be answered' },
                { value: 'loses', label: 'Instant loss' },
              ]}
            />
          </>
        )}

        <Label hint="The side that is losing, by material and by the engine's judgement, gets stronger pieces: Nudge, Slide, Leap, Ascend.">
          Comeback powers
        </Label>
        <Segmented<'on' | 'off'>
          value={config.comeback === false ? 'off' : 'on'}
          onChange={(v) => set('comeback', v === 'on')}
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
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
            <Label hint="One illegal move per game. If the computer notices, your move is undone and it moves twice.">You can cheat</Label>
            <Segmented<'on' | 'off'>
              value={config.playerCheats ? 'on' : 'off'}
              onChange={(v) => set('playerCheats', v === 'on')}
              options={[
                { value: 'off', label: 'No' },
                { value: 'on', label: 'Yes, once per game' },
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

        {config.mode === 'local' && (
          <>
            <Label hint="Minutes per side. Run out of time and you lose.">Clock</Label>
            <Segmented<string>
              value={String(config.clock ?? 0)}
              onChange={(v) => set('clock', Number(v) as ClockMinutes)}
              options={[
                { value: '0', label: 'None' },
                { value: '1', label: '1' },
                { value: '3', label: '3' },
                { value: '5', label: '5' },
                { value: '10', label: '10' },
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

        <Label hint={`${size.min}–${size.max} pieces per side, ${kings === 1 ? 'one of them a king' : 'two of them kings'}.`}>
          Army size
        </Label>
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
        <Label hint={lockedHint}>Comeback aura</Label>
        <Segmented<string>
          value={settings.aura}
          onChange={(v) => (unlocked.has(v) ? update({ aura: v }) : onPro())}
          options={cosmeticsOfKind('aura').map((c) => ({ value: c.id, label: label(c) }))}
        />
        <Label>Board</Label>
        <Segmented<BoardTheme>
          value={settings.boardTheme}
          onChange={(v) => (unlocked.has(v) ? update({ boardTheme: v }) : onPro())}
          options={cosmeticsOfKind('board').map((c) => ({ value: c.id as BoardTheme, label: label(c) }))}
        />
        <Label>Pieces</Label>
        <Segmented<PieceStyle>
          value={settings.pieceStyle}
          onChange={(v) => (unlocked.has(v) ? update({ pieceStyle: v }) : onPro())}
          options={cosmeticsOfKind('pieces').map((c) => ({ value: c.id as PieceStyle, label: label(c) }))}
        />
        <SwitchRow label="Sound" hint="Moves, captures, checks and the cheat calls." value={settings.sounds} onValueChange={(v) => update({ sounds: v })} />
        {/* src/haptics.ts plays nothing in the browser, so there the switch would do nothing: it shows off, greyed out, and says why. The stored choice is left as it is. */}
        <SwitchRow
          label="Vibration"
          hint={Platform.OS === 'web' ? 'Only in the phone app: the browser game does not vibrate.' : 'A tap for a move, a buzz for a capture or a check.'}
          value={Platform.OS === 'web' ? false : settings.haptics}
          onValueChange={(v) => update({ haptics: v })}
          disabled={Platform.OS === 'web'}
        />
        <Label hint="The moved piece jumps to its square instead of gliding. System follows your device's setting.">Reduce motion</Label>
        <Segmented<ReduceMotionSetting>
          value={settings.reduceMotion}
          onChange={(v) => update({ reduceMotion: v })}
          options={[
            { value: 'system', label: 'System' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
        <Button title="Reset to defaults" variant="ghost" small onPress={onReset} style={styles.reset} />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>About</Text>
        <Text style={styles.aboutName}>
          {APP_NAME} {APP_VERSION}
        </Text>
        <Text style={styles.aboutText}>
          Two kings a side, random armies, and comeback powers for whichever side is losing. Nothing leaves your device: {PRIVACY_SENTENCE.toLowerCase()}
        </Text>
        <View style={styles.links}>
          <Link label="MIT licence · source" url={SOURCE_URL} />
          <Link label="Privacy" url={PRIVACY_URL} />
          <Link label="What's new" url={CHANGELOG_URL} />
        </View>
      </Card>

      <Button title="New game with these settings" variant="secondary" onPress={onStart} style={styles.start} />
      <Button title={`Puzzles · ${puzzlesSolved}/${puzzleCount} solved`} variant="secondary" onPress={onPuzzles} />
      <Button title="How to play" variant="secondary" onPress={onRules} />
      <Button title="Support the game" variant="ghost" onPress={onPro} />

      <Button title={`Stats · ${stats.wins} W · ${stats.losses} L · ${stats.draws} D`} variant="ghost" onPress={onStats} />
    </ScrollView>
  );
}

/** One line describing the current game settings under the main Play button. */
function summarize(config: GameConfig): string {
  const parts: string[] = [];
  if (config.kings === 1) parts.push('one king');
  if (config.mode === 'ai') {
    parts.push({ easy: 'Easy', medium: 'Medium', hard: 'Hard' }[config.difficulty]);
    if (config.comeback !== false) parts.push('comeback powers');
    if (config.doubleCheck === 'loses' && config.kings !== 1) parts.push('double check loses instantly');
    parts.push(config.playAs === 'random' ? 'random colour' : config.playAs === 'w' ? 'you play White' : 'you play Black');
    if (config.cheating !== 'off') parts.push(config.cheating === 'low' ? 'computer cheats sometimes' : 'computer cheats often');
    if (config.playerCheats) parts.push('you may cheat once');
  } else if (config.clock) {
    parts.push(`${config.clock} min clock`);
  }
  parts.push(`${{ fair: 'fair', mirror: 'mirror', chaos: 'chaos', handicap: 'ranked' }[config.material]} armies`);
  parts.push(`${ARMY_SIZES[config.armySize].label.toLowerCase()} size`);
  return parts.join(' · ');
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
    : 'Same armies for everyone, once a day. Fair armies, medium, comeback powers on.';
  const streak = liveStreak(daily, today);
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

function LadderCard({ ladder, onRanked }: { ladder: LadderState; onRanked: () => void }) {
  const styles = useStyles();
  const p = ladderParams(ladder.rank);
  const diff = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }[p.difficulty];
  const cheat = { off: 'no cheating', low: 'some cheating', high: 'lots of cheating' }[p.cheating];
  return (
    <View style={styles.dailyCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.dailyTitle}>Ranked ladder · rank {ladder.rank}</Text>
        <Text style={styles.dailyText}>
          {p.label}. {diff}, {cheat}. Win to climb, lose to drop.
        </Text>
        {ladder.best > 1 && <Text style={styles.dailyStreak}>Best rank {ladder.best} · {ladder.games} games</Text>}
      </View>
      <Button title="Play" small onPress={onRanked} />
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
  summary: { color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: -4 },
  resumeNote: { color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: -4 },
  cardTitle: { color: theme.text, fontSize: 16, fontWeight: '800' },
  reset: { marginTop: 14, alignSelf: 'flex-start' },
  aboutName: { color: theme.text, fontWeight: '700', fontSize: 14, marginTop: 10 },
  aboutText: { color: theme.textMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 6 },
  start: { marginTop: 8 },
  stats: { color: theme.textMuted, textAlign: 'center', marginTop: 12, fontSize: 13 },
}));
