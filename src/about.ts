import Constants from 'expo-constants';

/**
 * What the About card says. The version is app.json's, read back through
 * expo-constants so the card and the store listing cannot disagree; a config
 * without one (it is always there in this app's builds) reads 0.0.0 rather
 * than "undefined". The privacy sentence is quoted from PRIVACY.md, and the
 * contract test checks it is still there, so the card cannot outlive the
 * promise it repeats.
 */
export const APP_NAME = 'Two Kings Chess';
export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';
export const SOURCE_URL = 'https://github.com/Platteration/chesscheatser';
/** `HEAD` rather than a branch name: GitHub resolves it to the default branch, whatever it is called. */
export const PRIVACY_URL = `${SOURCE_URL}/blob/HEAD/PRIVACY.md`;
export const CHANGELOG_URL = `${SOURCE_URL}/blob/HEAD/CHANGELOG.md`;
export const PRIVACY_SENTENCE = 'The app makes no network requests of its own.';
