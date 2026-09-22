import { describe, expect, it, vi } from 'vitest';
import { confirmAction } from '../confirm';

const rn = vi.hoisted(() => ({ platform: { OS: 'ios' }, alert: vi.fn() }));
vi.mock('react-native', () => ({ Platform: rn.platform, Alert: { alert: rn.alert } }));


const ask = (onConfirm: () => void) => confirmAction({ title: 'Reset settings?', message: 'Everything goes back.', cancelLabel: 'Cancel', confirmLabel: 'Reset', onConfirm });

function withWindow<T>(value: unknown, fn: () => T): T {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value, configurable: true, writable: true });
  try {
    return fn();
  } finally {
    if (had) Object.defineProperty(globalThis, 'window', had);
    else delete (globalThis as { window?: unknown }).window;
  }
}

describe('confirmAction', () => {
  it('on the web asks the browser, because react-native-web\'s Alert.alert is an empty method', () => {
    rn.platform.OS = 'web';
    rn.alert.mockReset();
    const confirm = vi.fn();
    const onConfirm = vi.fn();
    confirm.mockReturnValue(true);
    withWindow({ confirm }, () => ask(onConfirm));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith('Reset settings?\n\nEverything goes back.');
    confirm.mockReturnValue(false);
    withWindow({ confirm }, () => ask(onConfirm));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(rn.alert).not.toHaveBeenCalled();
  });

  it('on the web without a window does nothing rather than throwing', () => {
    rn.platform.OS = 'web';
    const onConfirm = vi.fn();
    withWindow(undefined, () => expect(() => ask(onConfirm)).not.toThrow());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('elsewhere shows a two-button alert: cancel first and safe, the destructive one named with its verb', () => {
    rn.platform.OS = 'ios';
    rn.alert.mockReset();
    const onConfirm = vi.fn();
    ask(onConfirm);
    expect(rn.alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = rn.alert.mock.calls[0] as [string, string, { text: string; style: string; onPress?: () => void }[]];
    expect(title).toBe('Reset settings?');
    expect(message).toBe('Everything goes back.');
    expect(buttons.map((b) => [b.text, b.style])).toEqual([
      ['Cancel', 'cancel'],
      ['Reset', 'destructive'],
    ]);
    expect(buttons[0].onPress).toBeUndefined();
    expect(onConfirm).not.toHaveBeenCalled();
    buttons[1].onPress!();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
