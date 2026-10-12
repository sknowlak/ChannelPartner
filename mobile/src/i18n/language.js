import i18n from 'i18next';
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_LOCALE, isSupportedLocale, matchLocale } from './locales';
import { updateProfile } from '../api/client';

// Which language to show (section 54), in order of precedence:
//   1. the signed-in partner's saved account preference (applied at login
//      and when the profile loads after app start);
//   2. the language last chosen on this device;
//   3. the phone's language, if it is one we support;
//   4. English.
// Only the language code is stored on the device - in the secure store the
// app already uses for the session (the value itself is not sensitive).
const STORAGE_KEY = 'uiLanguage';

export function deviceLanguage() {
  try {
    for (const loc of getLocales() || []) {
      const code = matchLocale(loc?.languageTag) || matchLocale(loc?.languageCode);
      if (code) return code;
    }
  } catch {
    /* localization module unavailable - fall through to English */
  }
  return DEFAULT_LOCALE;
}

export async function loadStoredLanguage() {
  try {
    const code = await SecureStore.getItemAsync(STORAGE_KEY);
    if (isSupportedLocale(code) && code !== i18n.language) await i18n.changeLanguage(code);
  } catch {
    /* nothing stored / store unavailable - keep the phone's language */
  }
}

async function rememberLanguage(code) {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, code);
  } catch {
    /* the choice still applies for this session */
  }
}

// Device-level choice (login screen): switch now and remember on this phone.
export async function setDeviceLanguage(code) {
  if (!isSupportedLocale(code)) return;
  if (code !== i18n.language) await i18n.changeLanguage(code);
  await rememberLanguage(code);
}

// The account preference from POST /partners/login (data.partner.language)
// or GET /my/profile (data.profile.language). Empty = no preference set, so
// the device choice stays.
export async function applyAccountLanguage(code) {
  if (!isSupportedLocale(code)) return;
  await setDeviceLanguage(code);
}

// Signed-in choice: switch immediately, remember on the device and save to
// the account so it follows the partner to the web app. A failed save keeps
// the local switch.
export async function changeAccountLanguage(code) {
  if (!isSupportedLocale(code)) return;
  await setDeviceLanguage(code);
  try {
    await updateProfile({ language: code });
  } catch {
    /* offline etc. - the device choice still applies */
  }
}
