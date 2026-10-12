import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { clearSession, listMyLeads } from '../api/client';
import { REFERRAL_LABEL } from './referralLabels';

export default function MyLeadsScreen({ navigation, onSignedOut }) {
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState(null);

  useFocusEffect(
    useCallback(() => {
      listMyLeads()
        .then(({ data }) => setLeads(data.registrations))
        .catch((err) => setError(err.response?.data?.reason || err.message));
    }, [])
  );

  const signOut = async () => {
    await clearSession();
    onSignedOut();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('RegisterCustomer')}>
          <Text style={styles.buttonText}>+ Register Lead</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={signOut}><Text style={styles.link}>Sign out</Text></TouchableOpacity>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {!leads && !error && <ActivityIndicator />}
      <FlatList
        data={leads || []}
        keyExtractor={(item) => item.registrationId}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('PartnerJourney', { registrationId: item.registrationId })}>
            <Text style={styles.name}>{item.customerName || item.registrationId}</Text>
            <Text style={styles.meta}>{item.customerMobile} · {item.currentStage}</Text>
            <Text style={styles.meta}>{item.isBooked ? 'Booked' : REFERRAL_LABEL[item.referralStatus] || ''}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={leads ? <Text style={styles.meta}>No leads yet.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  button: { backgroundColor: '#14213d', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '700' },
  link: { color: '#1a5fb4', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10 },
  name: { fontWeight: '700', fontSize: 15 },
  meta: { color: '#666', marginTop: 2 },
  error: { color: '#b3261e', marginBottom: 10 }
});
