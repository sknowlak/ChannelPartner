import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RegisterCustomerScreen from '../screens/RegisterCustomerScreen';
import RegistrationResultScreen from '../screens/RegistrationResultScreen';
import PartnerJourneyScreen from '../screens/PartnerJourneyScreen';
import BookingHandoverScreen from '../screens/BookingHandoverScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#14213d' }, headerTintColor: '#fff' }}>
        <Stack.Screen name="RegisterCustomer" component={RegisterCustomerScreen} options={{ title: 'Register Customer' }} />
        <Stack.Screen name="RegistrationResult" component={RegistrationResultScreen} options={{ title: 'Registration Result' }} />
        <Stack.Screen name="PartnerJourney" component={PartnerJourneyScreen} options={{ title: 'Partner Journey' }} />
        <Stack.Screen name="BookingHandover" component={BookingHandoverScreen} options={{ title: 'Booking Handover' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
