import React, { useEffect, useSyncExternalStore } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onStorageRefusedChange, STORAGE_REFUSED_NOTE, storageRefused } from '../storage';
import { themedStyles, useTheme } from './theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}

export function Button({ title, onPress, variant = 'primary', disabled, style, small }: ButtonProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        variant === 'danger' && styles.dangerBtn,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          small && styles.buttonTextSmall,
          variant === 'primary' && styles.primaryText,
          variant === 'danger' && styles.dangerText,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && styles.segmentActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface SwitchRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  /** For a feature this platform does not have: the switch is greyed out, and the hint says why. */
  disabled?: boolean;
}

/** A labelled on/off row. The switch carries the row's label, so a screen reader names it. */
export function SwitchRow({ label, hint, value, onValueChange, disabled = false }: SwitchRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchText}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: theme.accent, false: theme.border }}
      />
    </View>
  );
}

/**
 * The address belongs on the element on the web: react-native-web renders any
 * View carrying `href` as a real `<a>`, so the browser gives back what a
 * handler-only link takes away — open in a new tab, copy link address, the
 * status-bar preview, middle click — to an element already announced as a link.
 * The anchor navigates by itself there, so the press handler is left off: an
 * `openURL` beside it would open the address a second time. Everywhere else
 * there is no anchor, and `openURL` hands the address to the system browser,
 * which rejects when nothing answers the intent, hence the catch.
 * Either way the app opens nothing itself and needs no network permission.
 */
export function Link({ label, url }: { label: string; url: string }) {
  const styles = useStyles();
  const anchor: { href?: string; hrefAttrs?: { target: string; rel: string } } =
    Platform.OS === 'web' ? { href: url, hrefAttrs: { target: '_blank', rel: 'noreferrer' } } : {};
  return (
    <Pressable
      accessibilityRole="link"
      {...anchor}
      onPress={Platform.OS === 'web' ? undefined : () => Linking.openURL(url).catch(() => {})}
      hitSlop={8}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
    >
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

/**
 * How tall the storage note is drawn, 0 while it is not. The game and puzzle boards are sized
 * from the window rather than from the room their screen is given, so without this the note
 * would be drawn over the board's bottom rank in landscape.
 */
let noteHeight = 0;
const noteHeightListeners = new Set<() => void>();

function setNoteHeight(next: number) {
  if (next === noteHeight) return;
  noteHeight = next;
  for (const listener of noteHeightListeners) listener();
}

function onNoteHeightChange(listener: () => void): () => void {
  noteHeightListeners.add(listener);
  return () => {
    noteHeightListeners.delete(listener);
  };
}

const currentNoteHeight = () => noteHeight;

/** The height the storage note takes from the bottom of the window (0 while it is not shown). */
export function useStorageNoteHeight(): number {
  return useSyncExternalStore(onNoteHeightChange, currentNoteHeight, currentNoteHeight);
}

/**
 * Said under every screen while the store refuses to save (`storageRefused` in src/storage.ts):
 * on the shared GitHub Pages address another app can fill the storage this one writes to, and a
 * game that silently stops saving is lost on the next reload. Gone again once a write gets through.
 */
export function StorageNote() {
  const refused = useSyncExternalStore(onStorageRefusedChange, storageRefused, storageRefused);
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!refused) setNoteHeight(0);
  }, [refused]);
  if (!refused) return null;
  return (
    <View
      accessibilityRole="alert"
      testID="storage-note"
      onLayout={(e) => setNoteHeight(e.nativeEvent.layout.height)}
      style={[styles.storageNote, { paddingBottom: 10 + insets.bottom }]}
    >
      <Text style={styles.storageNoteText}>{Platform.OS === 'web' ? STORAGE_REFUSED_NOTE.web : STORAGE_REFUSED_NOTE.native}</Text>
    </View>
  );
}

export function Label({ children, hint }: { children: string; hint?: string }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{children}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const theme = useTheme();
  return <View style={[styles.card, style]}>{children}</View>;
}

const useStyles = themedStyles((theme) => ({
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: theme.radius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surfaceAlt,
  },
  buttonSmall: { paddingVertical: 10, paddingHorizontal: 14 },
  primary: { backgroundColor: theme.accent },
  secondary: { backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.border },
  ghost: { backgroundColor: 'transparent' },
  dangerBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.danger },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  buttonText: { color: theme.text, fontSize: 16, fontWeight: '600' },
  buttonTextSmall: { fontSize: 14 },
  primaryText: { color: theme.accentText },
  dangerText: { color: theme.danger },
  segmented: {
    flexDirection: 'row',
    backgroundColor: theme.surfaceAlt,
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: theme.accent },
  segmentText: { color: theme.textMuted, fontWeight: '600', fontSize: 14 },
  segmentTextActive: { color: theme.accentText },
  labelRow: { marginBottom: 6, marginTop: 14 },
  label: { color: theme.text, fontWeight: '700', fontSize: 14, letterSpacing: 0.3 },
  hint: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  switchText: { flex: 1 },
  link: { paddingVertical: 6 },
  linkText: { color: theme.accent, fontWeight: '700', fontSize: 14 },
  storageNote: {
    backgroundColor: theme.surface,
    borderTopWidth: 3,
    borderTopColor: theme.danger,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  storageNoteText: { color: theme.text, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
}));
