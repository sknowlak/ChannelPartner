import { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

// A password box with a show/hide toggle. Takes the same props as <TextInput>;
// secureTextEntry is controlled here.
export default function PasswordInput({ style, ...props }) {
  const { t } = useTranslation('common');
  const [visible, setVisible] = useState(false);
  const label = visible ? t('actions.hidePassword') : t('actions.showPassword');

  return (
    <View style={styles.wrap}>
      <TextInput
        {...props}
        style={[style, styles.input]}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: visible }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color="#666" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: 'center' },
  input: { paddingEnd: 44 },
  toggle: { position: 'absolute', end: 10, padding: 4 }
});
