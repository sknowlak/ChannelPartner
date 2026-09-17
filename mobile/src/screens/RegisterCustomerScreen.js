import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { registerCustomer } from '../api/client';

export default function RegisterCustomerScreen({ navigation }) {
  const [form, setForm] = useState({
    partnerId: 'PARTNER-001',
    projectId: 'PROJECT-A',
    name: '',
    mobile: '',
    email: '',
    externalReferenceId: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await registerCustomer({
        partnerId: form.partnerId,
        projectId: form.projectId,
        customer: { name: form.name, mobile: form.mobile, email: form.email },
        source: 'PARTNER_CRM',
        externalReferenceId: form.externalReferenceId || undefined
      });
      navigation.navigate('RegistrationResult', { result: data });
    } catch (err) {
      if (err.response?.data) {
        navigation.navigate('RegistrationResult', { result: err.response.data });
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Register Customer</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.label}>Partner</Text>
      <TextInput style={styles.input} value={form.partnerId} onChangeText={(v) => set('partnerId', v)} />

      <Text style={styles.label}>Customer Name</Text>
      <TextInput style={styles.input} value={form.name} onChangeText={(v) => set('name', v)} />

      <Text style={styles.label}>Mobile</Text>
      <TextInput style={styles.input} value={form.mobile} onChangeText={(v) => set('mobile', v)} keyboardType="phone-pad" placeholder="+91XXXXXXXXXX" />

      <Text style={styles.label}>Email</Text>
      <TextInput style={styles.input} value={form.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" />

      <Text style={styles.label}>Project</Text>
      <TextInput style={styles.input} value={form.projectId} onChangeText={(v) => set('projectId', v)} />

      <Text style={styles.label}>External CRM Reference</Text>
      <TextInput style={styles.input} value={form.externalReferenceId} onChangeText={(v) => set('externalReferenceId', v)} placeholder="CRM-12345" />

      <TouchableOpacity style={styles.button} onPress={submit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Register Customer</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16, color: '#14213d' },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 15 },
  button: { backgroundColor: '#14213d', padding: 14, borderRadius: 8, marginTop: 24, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  error: { color: '#b3261e', marginBottom: 10 }
});
