/**
 * Sharing a daily result in the browser build. On a phone `Share.share` hands the text to the
 * operating system's share sheet. In a browser, react-native-web's `Share.share` is
 * `navigator.share` where the browser has one and a rejection where it has not, which is most
 * desktop browsers: there the Share result button did nothing at all. So the web path tries
 * the share sheet, then the clipboard, and failing both says so and shows the text to copy by
 * hand. Free of React Native, so the tests can drive it with a stand-in navigator.
 */
export interface WebShareTarget {
  share?: (data: { text: string }) => Promise<void>;
  clipboard?: { writeText?: (text: string) => Promise<void> };
}

/** `shared`: the share sheet took it, or the player closed the sheet, which needs no note. */
export type WebShareOutcome = 'shared' | 'copied' | 'manual';

export const SHARE_NOTES: Record<Exclude<WebShareOutcome, 'shared'>, string> = {
  copied: 'Copied. Paste it wherever you like.',
  manual: 'This browser cannot share or copy it for you. Select the text below to copy it.',
};

const cancelled = (e: unknown) => e instanceof Error && e.name === 'AbortError';

export async function shareOnWeb(text: string, nav: WebShareTarget | undefined): Promise<WebShareOutcome> {
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ text });
      return 'shared';
    } catch (e) {
      if (cancelled(e)) return 'shared';
      // Refused (no user activation, a policy, data the sheet will not take): try the clipboard.
    }
  }
  const clipboard = nav?.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      return 'copied';
    } catch {
      // No permission, or the page lost focus: the text is shown instead.
    }
  }
  return 'manual';
}
