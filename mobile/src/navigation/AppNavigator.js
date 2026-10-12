import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { getMyProfile, loadSession, setSignedOutHandler } from '../api/client';
import { applyAccountLanguage, loadStoredLanguage } from '../i18n/language';
import LoginScreen from '../screens/LoginScreen';
import MyLeadsScreen from '../screens/MyLeadsScreen';
import RegisterCustomerScreen from '../screens/RegisterCustomerScreen';
import RegistrationResultScreen from '../screens/RegistrationResultScreen';
import PartnerJourneyScreen from '../screens/PartnerJourneyScreen';

const Stack = createNativeStackNavigator();

// Signed out -> Login only; signed in -> the partner's own leads.
export default function AppNavigator() {
  const [signedIn, setSignedIn] = useState(null);
  // Re-renders on language change so header titles follow it; the
  // NavigationContainer stays mounted, so the stack and screen state are kept.
  const { t } = useTranslation(['leads', 'common']);

  useEffect(() => {
    setSignedOutHandler(() => setSignedIn(false));
    // The language saved on this device is applied before the first screen
    // renders (no flash of the phone's language).
    Promise.all([loadSession(), loadStoredLanguage()])
      .then(([hasSession]) => {
        setSignedIn(hasSession);
        // The account preference wins over the device choice; refreshed in
        // the background so a change made on the web app follows the partner.
        if (hasSession) {
          getMyProfile()
            .then(({ data }) => applyAccountLanguage(data.profile?.language))
            .catch(() => {});
        }
      })
      .catch(() => setSignedIn(false));
  }, []);

  if (signedIn === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator accessibilityLabel={t('common:states.loading')} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#14213d' }, headerTintColor: '#fff' }}>
        {signedIn ? (
          <>
            <Stack.Screen name="MyLeads" options={{ title: t('leads:titles.myLeads') }}>
              {(props) => <MyLeadsScreen {...props} onSignedOut={() => setSignedIn(false)} />}
            </Stack.Screen>
            <Stack.Screen name="RegisterCustomer" component={RegisterCustomerScreen} options={{ title: t('leads:titles.registerLead') }} />
            <Stack.Screen name="RegistrationResult" component={RegistrationResultScreen} options={{ title: t('leads:titles.registrationResult') }} />
            <Stack.Screen name="PartnerJourney" component={PartnerJourneyScreen} options={{ title: t('leads:titles.lead') }} />
          </>
        ) : (
          <Stack.Screen name="Login" options={{ headerShown: false }}>
            {() => <LoginScreen onSignedIn={() => setSignedIn(true)} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
