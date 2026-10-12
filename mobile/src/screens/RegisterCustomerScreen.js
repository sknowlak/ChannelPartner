import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { createLead, listLeadFields, listProjects } from '../api/client';

// Registers a lead for the signed-in partner (the server takes the partner
// from the session - there is no partner field). The project is picked
// from the builder catalogue; any other field this partner's lead form
// marks required is rendered too, so the request passes the same checks as
// the web form.
const BASE_KEYS = ['name', 'mobile', 'email', 'projectId'];

function Chips({ options, value, onChange }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <TouchableOpacity key={o.value} style={[styles.chip, value === o.value && styles.chipOn]} onPress={() => onChange(o.value)}>
          <Text style={value === o.value ? styles.chipTextOn : null}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function RegisterCustomerScreen({ navigation }) {
  const [form, setForm] = useState({ name: '', mobile: '', email: '', projectId: '', externalReferenceId: '' });
  const [extra, setExtra] = useState({});
  const [projects, setProjects] = useState([]);
  const [requiredDefs, setRequiredDefs] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([listProjects(), listLeadFields()])
      .then(([{ data: p }, { data: f }]) => {
        setProjects(p.projects);
        setRequiredDefs(f.definitions.filter((d) => d.isEnabled && d.isRequired && !BASE_KEYS.includes(d.fieldKey)));
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  }, []);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const customer = { name: form.name, mobile: form.mobile, mobileCountry: 'IN', email: form.email || undefined };
    const body = { customer, projectId: form.projectId, source: 'PARTNER_CRM', externalReferenceId: form.externalReferenceId || undefined };
    for (const def of requiredDefs) {
      if (def.scope === 'customer') customer[def.fieldKey] = extra[def.fieldKey];
      else body[def.fieldKey] = extra[def.fieldKey];
    }
    try {
      const { data } = await createLead(body);
      navigation.replace('RegistrationResult', { result: data });
    } catch (err) {
      if (err.response?.status === 409 && err.response.data) navigation.replace('RegistrationResult', { result: err.response.data });
      else setError(err.response?.data?.reason || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.label}>Customer Name *</Text>
      <TextInput style={styles.input} value={form.name} onChangeText={(v) => set('name', v)} />

      <Text style={styles.label}>Mobile *</Text>
      <TextInput style={styles.input} value={form.mobile} onChangeText={(v) => set('mobile', v)} keyboardType="phone-pad" placeholder="+91XXXXXXXXXX or 10 digits" />

      <Text style={styles.label}>Email</Text>
      <TextInput style={styles.input} value={form.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" />

      <Text style={styles.label}>Project (refers the lead to its builder)</Text>
      <Chips
        options={[{ value: '', label: 'No project yet' }, ...projects.map((p) => ({ value: p.projectId, label: `${p.name} - ${p.builderName}` }))]}
        value={form.projectId}
        onChange={(v) => set('projectId', v)}
      />

      {requiredDefs.map((def) => (
        <View key={def.fieldKey}>
          <Text style={styles.label}>{def.label} *</Text>
          {def.dataType === 'SELECT' && def.options?.length ? (
            <Chips options={def.options.map((o) => ({ value: o, label: o }))} value={extra[def.fieldKey]} onChange={(v) => setExtra((x) => ({ ...x, [def.fieldKey]: v }))} />
          ) : (
            <TextInput
              style={styles.input}
              value={extra[def.fieldKey] || ''}
              onChangeText={(v) => setExtra((x) => ({ ...x, [def.fieldKey]: v }))}
              keyboardType={def.dataType === 'NUMBER' || def.dataType === 'CURRENCY' ? 'numeric' : 'default'}
              multiline={def.dataType === 'TEXTAREA'}
            />
          )}
        </View>
      ))}

      <Text style={styles.label}>Your CRM reference (optional)</Text>
      <TextInput style={styles.input} value={form.externalReferenceId} onChangeText={(v) => set('externalReferenceId', v)} placeholder="CRM-12345" />

      <TouchableOpacity style={styles.button} onPress={submit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Register Lead</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
