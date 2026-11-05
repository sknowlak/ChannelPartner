import { useEffect, useRef, useState } from 'react';
import { getLocales } from 'expo-localization';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { createLead, listLeadFields, listProjects } from '../api/client';
import { useDataLabels } from '../i18n/dataLabels';
import { errorMessage } from '../i18n/errors';

// Registers a lead for the signed-in partner (the server takes the partner
// from the session - there is no partner field). The project is picked
// from the builder catalogue; any other field this partner's lead form
// marks required is rendered too, so the request passes the same checks as
// the web form.
const BASE_KEYS = ['name', 'mobile', 'email', 'projectId'];

// The country a national-format number is read as: the phone's region (the
// app is used outside India too). A number typed with + carries its own
// country, so none is sent - a fixed 'IN' used to reject every +971/+44 number.
const deviceRegion = () => {
  try { return getLocales()?.[0]?.regionCode || undefined; } catch { return undefined; }
};
const newRetryKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

function Chips({ options, value, onChange }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <TouchableOpacity
          key={o.value}
          style={[styles.chip, value === o.value && styles.chipOn]}
          onPress={() => onChange(o.value)}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === o.value }}
        >
          <Text style={value === o.value ? styles.chipTextOn : null}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function RegisterCustomerScreen({ navigation }) {
  const { t } = useTranslation(['leads', 'common']);
  const { fieldLabel, optionLabel } = useDataLabels();
  const [form, setForm] = useState({ name: '', mobile: '', email: '', projectId: '', externalReferenceId: '' });
  const [extra, setExtra] = useState({});
  const [projects, setProjects] = useState([]);
  const [requiredDefs, setRequiredDefs] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);
  const retryKey = useRef(newRetryKey());
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    Promise.all([listProjects(), listLeadFields()])
      .then(([{ data: p }, { data: f }]) => {
        setProjects(p.projects);
        setRequiredDefs(f.definitions.filter((d) => d.isEnabled && d.isRequired && !BASE_KEYS.includes(d.fieldKey)));
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  // Any edit makes it a different submission, so it gets a fresh retry key.
  const set = (field, value) => { retryKey.current = newRetryKey(); setForm((f) => ({ ...f, [field]: value })); };
  const setExtraField = (key, value) => { retryKey.current = newRetryKey(); setExtra((x) => ({ ...x, [key]: value })); };

  const submit = async () => {
    if (inFlight.current) return; // a fast double tap before re-render
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    const mobile = form.mobile.trim();
    const customer = { name: form.name, mobile, mobileCountry: mobile.startsWith('+') ? undefined : deviceRegion(), email: form.email || undefined };
    const body = { customer, projectId: form.projectId, source: 'PARTNER_CRM', externalReferenceId: form.externalReferenceId || undefined };
    for (const def of requiredDefs) {
      if (def.scope === 'customer') customer[def.fieldKey] = extra[def.fieldKey];
      else body[def.fieldKey] = extra[def.fieldKey];
    }
    try {
      const { data } = await createLead(body, retryKey.current);
      if (mounted.current) navigation.replace('RegistrationResult', { result: data });
      else navigation.navigate('RegistrationResult', { result: data }); // went Back meanwhile - still show it
    } catch (err) {
      // Only a real rejection goes to the result screen; a 409 "already being
      // processed" has no status and used to show a blank red badge.
      if (err.response?.status === 409 && err.response.data?.status === 'REJECTED') navigation.replace('RegistrationResult', { result: err.response.data });
      else if (mounted.current) setError(errorMessage(err));
    } finally {
      inFlight.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.label}>{t('leads:form.customerName')}</Text>
      <TextInput style={styles.input} value={form.name} onChangeText={(v) => set('name', v)} accessibilityLabel={t('leads:form.customerName')} />

      <Text style={styles.label}>{t('leads:form.mobile')}</Text>
      <TextInput style={styles.input} value={form.mobile} onChangeText={(v) => set('mobile', v)} keyboardType="phone-pad" placeholder={t('leads:form.mobilePlaceholder')} accessibilityLabel={t('leads:form.mobile')} />

      <Text style={styles.label}>{t('common:fields.email')}</Text>
      <TextInput style={styles.input} value={form.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" accessibilityLabel={t('common:fields.email')} />

      <Text style={styles.label}>{t('leads:form.project')}</Text>
      <Chips
        options={[{ value: '', label: t('leads:form.noProject') }, ...projects.map((p) => ({ value: p.projectId, label: `${p.name} - ${p.builderName}` }))]}
        value={form.projectId}
        onChange={(v) => set('projectId', v)}
      />

      {requiredDefs.map((def) => (
        <View key={def.fieldKey}>
          <Text style={styles.label}>{t('leads:form.requiredLabel', { label: fieldLabel(def) })}</Text>
          {def.dataType === 'SELECT' && def.options?.length ? (
            <Chips options={def.options.map((o) => ({ value: o, label: optionLabel(o) }))} value={extra[def.fieldKey]} onChange={(v) => setExtraField(def.fieldKey, v)} />
          ) : (
            <TextInput
              style={styles.input}
              value={extra[def.fieldKey] || ''}
              onChangeText={(v) => setExtraField(def.fieldKey, v)}
              accessibilityLabel={fieldLabel(def)}
              keyboardType={def.dataType === 'NUMBER' || def.dataType === 'CURRENCY' ? 'numeric' : 'default'}
              multiline={def.dataType === 'TEXTAREA'}
            />
          )}
        </View>
      ))}

      <Text style={styles.label}>{t('leads:form.crmReference')}</Text>
      <TextInput style={styles.input} value={form.externalReferenceId} onChangeText={(v) => set('externalReferenceId', v)} accessibilityLabel={t('leads:form.crmReference')} />

      <TouchableOpacity style={styles.button} onPress={submit} disabled={submitting} accessibilityRole="button">
        {submitting ? <ActivityIndicator color="#fff" accessibilityLabel={t('common:states.loading')} /> : <Text style={styles.buttonText}>{t('leads:form.submit')}</Text>}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  container: { padding: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#14213d', borderColor: '#14213d' },
  chipTextOn: { color: '#fff' },
  button: { backgroundColor: '#14213d', padding: 14, borderRadius: 8, marginTop: 24, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  error: { color: '#b3261e', marginBottom: 10 }
});
