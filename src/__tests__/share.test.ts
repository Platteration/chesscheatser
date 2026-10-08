import { describe, expect, it, vi } from 'vitest';
import { shareOnWeb, SHARE_NOTES } from '../share';

const abort = () => Object.assign(new Error('Share canceled'), { name: 'AbortError' });
const refused = () => Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });

describe('sharing a result in the browser', () => {
  it('hands it to the share sheet where the browser has one', async () => {
    const share = vi.fn(async () => {});
    const writeText = vi.fn(async () => {});
    expect(await shareOnWeb('result', { share, clipboard: { writeText } })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'result' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('says nothing when the player closes the sheet', async () => {
    const writeText = vi.fn(async () => {});
    expect(await shareOnWeb('result', { share: async () => Promise.reject(abort()), clipboard: { writeText } })).toBe('shared');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies it where there is no share sheet, or the sheet refuses it', async () => {
    const writeText = vi.fn(async () => {});
    expect(await shareOnWeb('result', { clipboard: { writeText } })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('result');
    expect(await shareOnWeb('result', { share: async () => Promise.reject(refused()), clipboard: { writeText } })).toBe('copied');
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('falls back to showing the text when neither can take it', async () => {
    expect(await shareOnWeb('result', undefined)).toBe('manual');
    expect(await shareOnWeb('result', {})).toBe('manual');
    expect(await shareOnWeb('result', { clipboard: {} })).toBe('manual');
    expect(await shareOnWeb('result', { clipboard: { writeText: async () => Promise.reject(refused()) } })).toBe('manual');
    expect(await shareOnWeb('result', { share: async () => Promise.reject(refused()), clipboard: { writeText: async () => Promise.reject(refused()) } })).toBe('manual');
  });

  it('has a visible note for every outcome that is not the share sheet', () => {
    expect(Object.keys(SHARE_NOTES)).toEqual(['copied', 'manual']);
    for (const note of Object.values(SHARE_NOTES)) expect(note.length).toBeGreaterThan(10);
  });
});
