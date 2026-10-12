import { useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES } from '../i18n/locales';

// Accessible language selector. The current language is a button; tapping it
// opens a searchable list of every language (there can be 200+), each named
// in its own script with the English name alongside ("தமிழ் - Tamil"), so a
// reader finds their language whatever the current UI language.
// `onChange(code)` decides whether the choice is device-only or also saved to
// the account. `light` = for a dark background.
const optionText = (l) => (l.englishName && l.englishName !== l.name ? `${l.name} - ${l.englishName}` : l.name);
const byEnglishName = (a, b) => (a.englishName || a.name).localeCompare(b.englishName || b.name);
const REVIEWED = SUPPORTED_LOCALES.filter((l) => l.quality !== 'machine');
const MACHINE = SUPPORTED_LOCALES.filter((l) => l.quality === 'machine').sort(byEnglishName);

export default function LanguagePicker({ onChange, light = false, style }) {
  const { t, i18n } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = SUPPORTED_LOCALES.find((l) => l.code === i18n.language) || REVIEWED[0];

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (l) => !q || [l.name, l.englishName, l.code].some((s) => s && s.toLowerCase().includes(q));
    const reviewed = REVIEWED.filter(match);
    const machine = MACHINE.filter(match);
    return [
      ...(machine.length && reviewed.length ? [{ header: t('common:language.reviewed') }] : []),
      ...reviewed,
      ...(machine.length ? [{ header: t('common:language.machine') }] : []),
      ...machine
    ];
  }, [query, t]);

  const choose = (code) => {
    setOpen(false);
    setQuery('');
    if (code !== i18n.language) onChange(code);
  };

  return (
    <View style={[styles.wrap, style]}>
      <Text style={[styles.label, light && styles.labelLight]}>{t('common:language.label')}</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${t('common:language.label')}: ${current.name}`}
        accessibilityLanguage={current.intl}
      >
        <Text style={styles.buttonText}>{optionText(current)}</Text>
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} accessibilityRole="header">{t('common:language.label')}</Text>
            <TouchableOpacity onPress={() => setOpen(false)} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.close}>{t('common:actions.close')}</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder={t('common:actions.search')}
            accessibilityLabel={t('common:actions.search')}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          <FlatList
            data={rows}
            keyExtractor={(r) => r.header || r.code}
            keyboardShouldPersistTaps="handled"
            accessibilityRole="radiogroup"
            renderItem={({ item }) => (item.header ? (
              <Text style={styles.groupHeader} accessibilityRole="header">{item.header}</Text>
            ) : (
              <TouchableOpacity
                style={[styles.row, item.code === current.code && styles.rowOn]}
                onPress={() => choose(item.code)}
                accessibilityRole="radio"
                accessibilityState={{ checked: item.code === current.code, selected: item.code === current.code }}
                accessibilityLabel={item.name}
                accessibilityLanguage={item.intl}
              >
                <Text style={[styles.rowText, item.code === current.code && styles.rowTextOn]}>{optionText(item)}</Text>
              </TouchableOpacity>
            ))}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 4 },
  labelLight: { color: '#fff' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#fff', minHeight: 44 },
  buttonText: { color: '#14213d', fontSize: 15, flexShrink: 1 },
  chevron: { color: '#14213d', marginLeft: 8 },
  sheet: { flex: 1, paddingTop: 48, backgroundColor: '#fff' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#14213d' },
  close: { color: '#14213d', fontWeight: '600', fontSize: 15 },
  search: { marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  groupHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, fontSize: 12, fontWeight: '700', color: '#666', textTransform: 'uppercase' },
  row: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e5', minHeight: 44, justifyContent: 'center' },
  rowOn: { backgroundColor: '#eef1f7' },
  rowText: { color: '#14213d', fontSize: 15 },
  rowTextOn: { fontWeight: '700' }
});
