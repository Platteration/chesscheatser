import React from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
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
}

/** A labelled on/off row. The switch carries the row's label, so a screen reader names it. */
export function SwitchRow({ label, hint, value, onValueChange }: SwitchRowProps) {
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
        accessibilityLabel={label}
        trackColor={{ true: theme.accent, false: theme.border }}
      />
    </View>
  );
}

/** An external link: opens in the browser (or a new tab on the web build). Needs no network permission of the app's own. */
export function Link({ label, url }: { label: string; url: string }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => Linking.openURL(url).catch(() => {})}
      hitSlop={8}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
    >
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
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
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
}));
