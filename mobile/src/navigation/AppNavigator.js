import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { loadSession, setSignedOutHandler } from '../api/client';
import LoginScreen from '../screens/LoginScreen';
import MyLeadsScreen from '../screens/MyLeadsScreen';
import RegisterCustomerScreen from '../screens/RegisterCustomerScreen';
import RegistrationResultScreen from '../screens/RegistrationResultScreen';
import PartnerJourneyScreen from '../screens/PartnerJourneyScreen';

const Stack = createNativeStackNavigator();

// Signed out -> Login only; signed in -> the partner's own leads.
export default function AppNavigator() {
  const [signedIn, setSignedIn] = useState(null);

  useEffect(() => {
    setSignedOutHandler(() => setSignedIn(false));
    loadSession().then(setSignedIn).catch(() => setSignedIn(false));
  }, []);

  if (signedIn === null) {
    return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#14213d' }, headerTintColor: '#fff' }}>
        {signedIn ? (
          <>
            <Stack.Screen name="MyLeads" options={{ title: 'My Leads' }}>
              {(props) => <MyLeadsScreen {...props} onSignedOut={() => setSignedIn(false)} />}
            </Stack.Screen>
            <Stack.Screen name="RegisterCustomer" component={RegisterCustomerScreen} options={{ title: 'Register Lead' }} />
            <Stack.Screen name="RegistrationResult" component={RegistrationResultScreen} options={{ title: 'Registration Result' }} />
            <Stack.Screen name="PartnerJourney" component={PartnerJourneyScreen} options={{ title: 'Lead' }} />
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
