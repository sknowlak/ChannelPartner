import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getLead, getLeadAudit, listStatuses, updateLeadProgress } from '../api/client';
import { REFERRAL_LABEL } from './referralLabels';

// One of the signed-in partner's leads (the server returns 404 for anyone
// else's). Status moves along the partner's own pipeline; booking is
// confirmed by the builder in the builder portal (section 52), so there is
// no booking button here.
export default function PartnerJourneyScreen({ route }) {
  const { registrationId } = route.params;
  const [detail, setDetail] = useState(null);
  const [events, setEvents] = useState([]);
  const [stages, setStages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [{ data: d }, { data: audit }, { data: st }] = await Promise.all([getLead(registrationId), getLeadAudit(registrationId), listStatuses()]);
      setDetail(d);
      setEvents(audit.events);
      setStages(st.statuses.filter((s) => s.isActive && !s.isBooking && !s.requiresSchedule).map((s) => s.name));
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    }
  }, [registrationId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const advanceStage = async () => {
    const current = stages.indexOf(detail.registration.currentStage);
    const next = stages[current + 1];
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      await updateLeadProgress(registrationId, { stage: next });
      await load();
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!detail) return <View style={styles.container}>{error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}</View>;
  const { registration, customer } = detail;
  const nextStage = stages[stages.indexOf(registration.currentStage) + 1];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.card}>
        <Row label="Customer" value={`${customer.name} (${customer.mobile})`} />
        <Row label="Project" value={registration.projectId || '-'} />
        <Row label="Protection Expiry" value={new Date(registration.protectionExpiry).toLocaleDateString()} />
        <Row label="Lead Status" value={registration.currentStage} />
        <Row label="Referral" value={registration.isBooked ? 'Booked by builder' : REFERRAL_LABEL[registration.referralStatus] || '-'} />
        {registration.referralDecision?.reason ? <Text style={styles.hint}>Builder's reason: {registration.referralDecision.reason}</Text> : null}
      </View>

      {!registration.isBooked && nextStage && (
        <TouchableOpacity style={styles.secondaryButton} disabled={busy} onPress={advanceStage}>
          {busy ? <ActivityIndicator /> : <Text style={styles.secondaryButtonText}>Move to "{nextStage}"</Text>}
        </TouchableOpacity>
      )}
      <Text style={styles.hint}>
        {registration.isBooked
          ? 'Booked by the builder - your attribution and commission eligibility are kept.'
          : 'Bookings are confirmed by the builder once they accept the referral.'}
      </Text>

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
  container: { padding: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 8, color: '#14213d' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { color: '#666' },
  rowValue: { fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  secondaryButton: { borderWidth: 1, borderColor: '#14213d', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  secondaryButtonText: { color: '#14213d', fontWeight: '700' },
  hint: { color: '#666', marginBottom: 10 },
  eventRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#eee' },
  eventTs: { fontSize: 11, color: '#888' },
  error: { color: '#b3261e', marginBottom: 10 }
});
