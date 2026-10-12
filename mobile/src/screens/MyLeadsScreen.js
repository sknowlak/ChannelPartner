import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { clearSession, listMyLeads } from '../api/client';
import LanguagePicker from '../components/LanguagePicker';
import { useDataLabels } from '../i18n/dataLabels';
import { errorMessage } from '../i18n/errors';
import { changeAccountLanguage } from '../i18n/language';
import { referralLabel } from './referralLabels';

export default function MyLeadsScreen({ navigation, onSignedOut }) {
  const { t, i18n } = useTranslation(['leads', 'common']);
  const { statusLabel } = useDataLabels();
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState(null);

  useFocusEffect(
    useCallback(() => {
      listMyLeads()
        .then(({ data }) => setLeads(data.registrations))
        .catch((err) => setError(errorMessage(err)));
    }, [])
  );

  const signOut = async () => {
    await clearSession();
    onSignedOut();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('RegisterCustomer')} accessibilityRole="button">
          <Text style={styles.buttonText}>{t('leads:list.registerLead')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={signOut} accessibilityRole="button"><Text style={styles.link}>{t('leads:list.signOut')}</Text></TouchableOpacity>
      </View>
      {/* Switches immediately and saves to the partner's account. */}
      <LanguagePicker onChange={changeAccountLanguage} />
      {error && <Text style={styles.error}>{error}</Text>}
      {!leads && !error && <ActivityIndicator accessibilityLabel={t('common:states.loading')} />}
      <FlatList
        data={leads || []}
        keyExtractor={(item) => item.registrationId}
        // Re-render the rows (stage/referral labels) on a language switch.
        extraData={i18n.language}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('PartnerJourney', { registrationId: item.registrationId })}>
            <Text style={styles.name}>{item.customerName || item.registrationId}</Text>
            <Text style={styles.meta}>{item.customerMobile} · {statusLabel(item.currentStage)}</Text>
            <Text style={styles.meta}>{item.isBooked ? t('leads:list.booked') : referralLabel(item.referralStatus)}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={leads ? <Text style={styles.meta}>{t('leads:list.empty')}</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  button: { backgroundColor: '#14213d', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '700' },
  link: { color: '#1a5fb4', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10 },
  name: { fontWeight: '700', fontSize: 15 },
  meta: { color: '#666', marginTop: 2 },
  error: { color: '#b3261e', marginBottom: 10 }
});
