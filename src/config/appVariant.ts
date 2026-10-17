import Constants from 'expo-constants';

const configuredScheme = Constants.expoConfig?.scheme;
export const appScheme = Array.isArray(configuredScheme) ? configuredScheme[0] : configuredScheme;
if (!appScheme) throw new Error('Scheme Expo mancante dalla configurazione della variante attiva.');
export const authCallbackPath = 'auth/callback';
