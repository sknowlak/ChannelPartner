import { StyleSheet, Text, View } from 'react-native';

export default function BookingHandoverScreen({ route }) {
  const { booking } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Booking Confirmed</Text>
      <View style={styles.card}>
        <Row label="Operational Owner" value="Builder" />
        <Row label="Partner Attribution" value={booking.partnerAttribution} />
        <Row label="Commission Eligibility" value={booking.commissionEligibility} />
        <Row label="Handover" value="Completed" />
      </View>
    </View>
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
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { color: '#666' },
  rowValue: { fontWeight: '700' }
});
