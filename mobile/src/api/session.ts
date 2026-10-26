import * as Keychain from 'react-native-keychain';
import type {AuthTokens} from './types';

const SERVICE = 'com.unimark.session';

export async function readSession(): Promise<AuthTokens | null> {
  const credentials = await Keychain.getGenericPassword({service: SERVICE});
  if (!credentials) {
    return null;
  }
  try {
    return JSON.parse(credentials.password) as AuthTokens;
  } catch {
    await clearSession();
    return null;
  }
}

export async function writeSession(session: AuthTokens): Promise<void> {
  await Keychain.setGenericPassword('unimark', JSON.stringify(session), {service: SERVICE});
}

export async function clearSession(): Promise<void> {
  await Keychain.resetGenericPassword({service: SERVICE});
}
