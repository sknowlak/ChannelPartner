import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES } from '../i18n/locales';

// Accessible language selector: one radio button per language, each named
// in its own script (a Bengali reader finds "বাংলা" whatever the current UI
// language). `onChange(code)` decides whether the choice is device-only or
// also saved to the account. `light` = for a dark background.
export default function LanguagePicker({ onChange, light = false, style }) {
  const { t, i18n } = useTranslation('common');
  const current = i18n.language;

  return (
    <View style={[styles.wrap, style]}>
      <Text style={[styles.label, light && styles.labelLight]}>{t('common:language.label')}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t('common:language.label')}>
        {SUPPORTED_LOCALES.map((l) => {
          const selected = l.code === current;
          return (
            <TouchableOpacity
              key={l.code}
              style={[styles.option, selected && styles.optionOn]}
              onPress={() => !selected && onChange(l.code)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, selected }}
              accessibilityLabel={l.name}
              accessibilityLanguage={l.intl}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <Text style={[styles.optionText, selected && styles.optionTextOn]}>{l.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 4 },
  labelLight: { color: '#fff' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderWidth: 1, borderColor: '#ccc', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#fff', minHeight: 32, justifyContent: 'center' },
  optionOn: { backgroundColor: '#14213d', borderColor: '#14213d' },
  optionText: { color: '#14213d' },
  optionTextOn: { color: '#fff', fontWeight: '700' }
});
