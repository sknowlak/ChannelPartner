import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { API_CONFIG_ERROR, login, saveSession } from '../api/client';
import LanguagePicker from '../components/LanguagePicker';
import { configErrorMessage, errorMessage } from '../i18n/errors';
import { applyAccountLanguage, setDeviceLanguage } from '../i18n/language';

// Same login as the web partner portal (owner or team member).
export default function LoginScreen({ onSignedIn }) {
  const { t } = useTranslation(['auth', 'common']);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Built at render time so it follows a language switch.
  const shownError = error || configErrorMessage(API_CONFIG_ERROR);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await login(username.trim(), password);
      await saveSession(data.token);
      // The account's saved language (if any) wins over the device choice.
      await applyAccountLanguage(data.partner?.language);
      onSignedIn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Device-only choice before sign-in; the account preference applies after. */}
      <LanguagePicker onChange={setDeviceLanguage} />
      <Text style={styles.title} accessibilityRole="header">{t('auth:login.title')}</Text>
      {shownError && <Text style={styles.error} accessibilityLiveRegion="polite">{shownError}</Text>}
      <Text style={styles.label}>{t('common:fields.username')}</Text>
      <TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t('common:fields.username')} />
      <Text style={styles.label}>{t('common:fields.password')}</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry accessibilityLabel={t('common:fields.password')} />
      <TouchableOpacity
        style={styles.button}
        onPress={submit}
        disabled={busy || !!API_CONFIG_ERROR || !username || !password}
        accessibilityRole="button"
        accessibilityLabel={busy ? t('common:actions.signingIn') : t('common:actions.signIn')}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('common:actions.signIn')}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 80 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16, color: '#14213d' },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 15 },
  button: { backgroundColor: '#14213d', padding: 14, borderRadius: 8, marginTop: 24, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  error: { color: '#b3261e', marginBottom: 10 }
});
