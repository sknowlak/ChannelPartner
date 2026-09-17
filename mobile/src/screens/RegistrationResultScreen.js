import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function RegistrationResultScreen({ route, navigation }) {
  const { result } = route.params;
  const isAccepted = result.status === 'ACCEPTED';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Registration Result</Text>
      <View style={[styles.badge, isAccepted ? styles.accepted : styles.rejected]}>
        <Text style={styles.badgeText}>{result.status}</Text>
      </View>

      {isAccepted ? (
        <View style={styles.card}>
          <Row label="Registration ID" value={result.registrationId} />
          <Row label="Ownership" value={result.owner} />
          <Row label="Protection Window" value={`${result.protectionDays} Days`} />
          <Row label="Protected Until" value={new Date(result.expiryDate).toLocaleDateString()} />
        </View>
      ) : (
        <View style={styles.card}>
          <Row label="Reason" value={result.reasonCode} />
          <Row label="Protected Until" value={result.protectedUntil ? new Date(result.protectedUntil).toLocaleDateString() : '-'} />
        </View>
      )}

      {isAccepted && (
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('PartnerJourney', { registrationId: result.registrationId })}
        >
          <Text style={styles.buttonText}>Open Partner Journey</Text>
        </TouchableOpacity>
      )}
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
  badge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, marginBottom: 16 },
  accepted: { backgroundColor: '#e1f5e5' },
  rejected: { backgroundColor: '#fbe2e2' },
  badgeText: { fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { color: '#666' },
  rowValue: { fontWeight: '700' },
  button: { backgroundColor: '#14213d', padding: 14, borderRadius: 8, marginTop: 24, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' }
});
