import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { createBooking, getAuditTimeline, getRegistration, updateProgress } from '../api/client';

const STAGES = ['Registered', 'Contacted', 'Qualified', 'Site Visit', 'Negotiation'];

export default function PartnerJourneyScreen({ route, navigation }) {
  const { registrationId } = route.params;
  const [registration, setRegistration] = useState(null);
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [{ data: reg }, { data: audit }] = await Promise.all([
        getRegistration(registrationId, 'partner'),
        getAuditTimeline(registrationId)
      ]);
      setRegistration(reg);
      setEvents(audit.events);
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  }, [registrationId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const advanceStage = async () => {
    const currentIndex = STAGES.indexOf(registration.currentStage);
    const next = STAGES[currentIndex + 1] || STAGES[STAGES.length - 1];
    setBusy(true);
    try {
      await updateProgress(registrationId, { stage: next, actor: registration.partnerId, source: 'PARTNER_CRM' });
      await load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    setBusy(true);
    try {
      const { data } = await createBooking(registrationId, {});
      navigation.navigate('BookingHandover', { booking: data });
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <View style={styles.container}><Text style={styles.error}>{error}</Text></View>;
  if (!registration) return <View style={styles.container}><ActivityIndicator /></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Partner Lead Journey</Text>

      <View style={styles.card}>
        <Row label="Customer" value={`${registration.customer.name} (${registration.customer.mobile})`} />
        <Row label="Project" value={registration.projectId} />
        <Row label="Protection Expiry" value={new Date(registration.protectionExpiry).toLocaleDateString()} />
        <Row label="Lead Stage" value={registration.currentStage} />
      </View>

      {!registration.isBooked ? (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondaryButton} disabled={busy} onPress={advanceStage}>
            <Text style={styles.secondaryButtonText}>Advance to Next Stage</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} disabled={busy} onPress={complete}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Complete Booking</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.hint}>This customer has already been booked and handed over to the builder.</Text>
      )}

      <Text style={styles.sectionTitle}>Progress History</Text>
      <View style={styles.card}>
        {events.map((ev) => (
          <View key={ev.auditId} style={styles.eventRow}>
            <Text style={styles.eventTs}>{new Date(ev.timestamp).toLocaleString()}</Text>
            <Text>{ev.description}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16, color: '#14213d' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 8, color: '#14213d' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { color: '#666' },
  rowValue: { fontWeight: '700' },
  actions: { gap: 10, marginBottom: 10 },
  button: { backgroundColor: '#14213d', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  secondaryButton: { borderWidth: 1, borderColor: '#14213d', padding: 12, borderRadius: 8, alignItems: 'center' },
  secondaryButtonText: { color: '#14213d', fontWeight: '700' },
  hint: { color: '#666', marginBottom: 10 },
  eventRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#eee' },
  eventTs: { fontSize: 11, color: '#888' },
  error: { color: '#b3261e' }
});
