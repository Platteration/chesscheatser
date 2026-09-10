import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Stats } from '../game/config';
import { liveStreak, type DailyState } from '../game/daily';
import type { LadderState } from '../game/ladder';
import { useEntitlements } from '../entitlements';
import { Button, Card } from './components';
import { themedStyles, useTheme } from './theme';

interface Props {
  stats: Stats;
  daily: DailyState;
  ladder: LadderState;
  puzzlesSolved: number;
  puzzleCount: number;
  onBack: () => void;
}

function pct(n: number, d: number): string {
  return d === 0 ? '—' : `${Math.round((100 * n) / d)}%`;
}

export function StatsScreen({ stats, daily, ladder, puzzlesSolved, puzzleCount, onBack }: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isSupporter } = useEntitlements();
  const dailyGames = Object.values(daily.results);
  const dailyWins = dailyGames.filter((r) => r.outcome === 'win').length;
  const bestStreak = Math.max(daily.streak, 0);
  const rows: { title: string; items: [string, string][] }[] = [
    {
      title: 'Versus computer',
      items: [
        ['Games', String(stats.gamesPlayed)],
        ['Record', `${stats.wins} W · ${stats.losses} L · ${stats.draws} D`],
        ['Win rate', pct(stats.wins, stats.gamesPlayed)],
        ['Biggest comeback', stats.biggestComeback ? `won from ${(stats.biggestComeback / 100).toFixed(1)} behind` : '—'],
      ],
    },
    {
      title: 'Cheat detection',
      items: [
        ['Computer cheats caught', `${stats.cheatsCaught} of ${stats.cheatsCaught + stats.cheatsMissed} (${pct(stats.cheatsCaught, stats.cheatsCaught + stats.cheatsMissed)})`],
        ['False accusations', String(stats.falseAccusations)],
        ['Your cheats', stats.ownCheats ? `${stats.ownCheats}, caught ${stats.ownCheatsCaught} (${pct(stats.ownCheatsCaught, stats.ownCheats)})` : '0'],
      ],
    },
    {
      title: 'Ranked ladder',
      items: [
        ['Current rank', String(ladder.rank)],
        ['Best rank', String(ladder.best)],
        ['Ranked games', String(ladder.games)],
      ],
    },
    {
      title: 'Daily challenge',
      items: [
        ['Played', String(dailyGames.length)],
        ['Won', `${dailyWins} (${pct(dailyWins, dailyGames.length)})`],
        ['Streak', `${liveStreak(daily)} now · ${bestStreak} last`],
      ],
    },
    { title: 'Puzzles', items: [['Solved', `${puzzlesSolved} / ${puzzleCount}`]] },
  ];
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Button title="‹ Back" variant="ghost" small onPress={onBack} />
        <Text style={styles.title}>{isSupporter ? 'Stats 👑' : 'Stats'}</Text>
        <View style={{ width: 64 }} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {rows.map((r) => (
          <Card key={r.title}>
            <Text style={[styles.heading, { color: theme.accent }]}>{r.title}</Text>
            {r.items.map(([k, v]) => (
              <View key={k} style={styles.row}>
                <Text style={styles.key}>{k}</Text>
                <Text style={styles.value}>{v}</Text>
              </View>
            ))}
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = themedStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  title: { color: theme.text, fontWeight: '800', fontSize: 16 },
  content: { padding: 16, gap: 12 },
  heading: { fontSize: 15, fontWeight: '800', marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 12 },
  key: { color: theme.textMuted, fontSize: 14, flexShrink: 1 },
  value: { color: theme.text, fontSize: 14, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
}));
