import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../i18n/format';

// Registration outcome codes the API returns; the code itself is kept, only
// its on-screen label is translated (unknown codes are shown as sent).
const RESULT_STATUSES = ['ACCEPTED', 'REJECTED'];

export default function RegistrationResultScreen({ route, navigation }) {
  const { t } = useTranslation(['leads', 'common']);
  const { result } = route.params;
  const isAccepted = result.status === 'ACCEPTED';
  const statusText = RESULT_STATUSES.includes(result.status) ? t(`leads:result.status.${result.status}`) : result.status;

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">{t('leads:result.title')}</Text>
      <View style={[styles.badge, isAccepted ? styles.accepted : styles.rejected]}>
        <Text style={styles.badgeText}>{statusText}</Text>
      </View>

      {isAccepted ? (
        <View style={styles.card}>
          <Row label={t('leads:result.registrationId')} value={result.registrationId} />
          <Row label={t('leads:result.protectionWindow')} value={t('leads:result.days', { count: result.protectionDays })} />
          <Row label={t('leads:result.protectedUntil')} value={formatDate(result.expiryDate)} />
        </View>
      ) : (
        <View style={styles.card}>
          <Row label={t('leads:result.reason')} value={result.reason || result.reasonCode} />
          <Row label={t('leads:result.protectedUntil')} value={result.protectedUntil ? formatDate(result.protectedUntil) : '-'} />
        </View>
      )}

      {isAccepted && (
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.replace('PartnerJourney', { registrationId: result.registrationId })}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{t('leads:result.openLead')}</Text>
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
  container: { padding: 20 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16, color: '#14213d' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, marginBottom: 16 },
  accepted: { backgroundColor: '#e1f5e5' },
  rejected: { backgroundColor: '#fbe2e2' },
  badgeText: { fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { color: '#666', flexShrink: 1, marginRight: 8 },
  rowValue: { fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  button: { backgroundColor: '#14213d', padding: 14, borderRadius: 8, marginTop: 24, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' }
});
