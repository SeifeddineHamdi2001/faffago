import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useI18n } from '../i18n';
import { hasLocationPermission, requestLocationPermission } from '../location';
import { CaisseScreen } from '../screens/CaisseScreen';
import { ChatListScreen, ChatScreen } from '../screens/ChatScreens';
import { LocationScreen, UpdateScreen } from '../screens/GateScreens';
import { JourneeScreen } from '../screens/JourneeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MenuScreen } from '../screens/MenuScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { PinScreen } from '../screens/PinScreen';
import { ScannerScreen } from '../screens/ScannerScreen';
import { DeliverScreen } from '../screens/livreur/DeliverScreen';
import { RetourDepotScreen } from '../screens/livreur/RetourDepotScreen';
import { StopScreen } from '../screens/livreur/StopScreen';
import { TourneeScreen } from '../screens/livreur/TourneeScreen';
import { GainsScreen } from '../screens/livreur/GainsScreen';
import { PickupScreen } from '../screens/ramasseur/PickupScreen';
import { RamassagesScreen } from '../screens/ramasseur/RamassagesScreen';
import { VisitScreen } from '../screens/ramasseur/VisitScreen';
import { useApp } from '../state/app';
import { TOUCH_MIN, colors, font } from '../theme';
import type { RootScreenProps, RootStackParams, TabParams } from './types';

const Stack = createNativeStackNavigator<RootStackParams>();
const Tab = createBottomTabNavigator<TabParams>();

function ScanTab() {
  return <ScannerScreen />;
}

function ScannerRoute({ route }: RootScreenProps<'Scanner'>) {
  return <ScannerScreen pickupId={route.params.pickupId} step={route.params.step} />;
}

function ChangePinRoute({ navigation }: RootScreenProps<'ChangePin'>) {
  return <PinScreen mode="create" onDone={() => navigation.goBack()} />;
}

/**
 * The bottom bar (Coursier 3): the scan button in the centre, in orange with
 * navy text. The livreur has Tournée, the ramasseur Ramassages.
 */
function Tabs() {
  const { session, unread } = useApp();
  const { t } = useI18n();
  const isLivreur = session?.user.role === 'LIVREUR';
  const news = unread.notifications + unread.chats;
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { height: TOUCH_MIN + 14 },
        tabBarLabelStyle: { fontSize: font.small, fontWeight: '700' },
        tabBarActiveTintColor: colors.orangeDark,
        tabBarInactiveTintColor: colors.navyMuted,
        tabBarIconStyle: { display: 'none' },
      }}
    >
      <Tab.Screen name="Journee" component={JourneeScreen} options={{ title: t('tabJournee') }} />
      {isLivreur ? (
        <Tab.Screen name="Tournee" component={TourneeScreen} options={{ title: t('tabTournee') }} />
      ) : (
        <Tab.Screen
          name="Ramassages"
          component={RamassagesScreen}
          options={{ title: t('tabRamassages') }}
        />
      )}
      <Tab.Screen
        name="Scan"
        component={ScanTab}
        options={{
          title: t('tabScanner'),
          tabBarActiveBackgroundColor: colors.orange,
          tabBarInactiveBackgroundColor: colors.orange,
          tabBarActiveTintColor: colors.navy,
          tabBarInactiveTintColor: colors.navy,
        }}
      />
      <Tab.Screen name="Caisse" component={CaisseScreen} options={{ title: t('tabCaisse') }} />
      <Tab.Screen
        name="Menu"
        component={MenuScreen}
        options={{ title: t('tabMenu'), tabBarBadge: news > 0 ? news : undefined }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { ready, session, locked, hasPin, updateRequired, pendingCount } = useApp();
  const { t } = useI18n();
  const [location, setLocation] = useState<boolean | null>(null);

  const askLocation = useCallback(async () => {
    setLocation((await hasLocationPermission()) || (await requestLocationPermission()));
  }, []);

  useEffect(() => {
    if (session && !locked) void askLocation();
  }, [session, locked, askLocation]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.orange} size="large" />
      </View>
    );
  }
  // An outdated app blocks only once its queue is empty (tech-stack 5).
  if (updateRequired && (!session || pendingCount === 0)) return <UpdateScreen />;
  if (!session) return <LoginScreen />;
  if (!hasPin) return <PinScreen mode="create" />;
  if (locked) return <PinScreen mode="unlock" />;
  if (updateRequired) return <UpdateScreen />;
  if (location === false) return <LocationScreen onRetry={() => void askLocation()} />;

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerTintColor: colors.navy,
          headerTitleStyle: { fontSize: font.large },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="Stop" component={StopScreen} options={{ title: t('maTournee') }} />
        <Stack.Screen name="Deliver" component={DeliverScreen} options={{ title: t('scan') }} />
        <Stack.Screen
          name="Scanner"
          component={ScannerRoute}
          options={{ title: t('tabScanner') }}
        />
        <Stack.Screen name="Pickup" component={PickupScreen} options={{ title: t('ramassages') }} />
        <Stack.Screen name="Visit" component={VisitScreen} options={{ title: t('ramassages') }} />
        <Stack.Screen name="Gains" component={GainsScreen} options={{ title: t('mesGains') }} />
        <Stack.Screen
          name="RetourDepot"
          component={RetourDepotScreen}
          options={{ title: t('retourAuDepot') }}
        />
        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ title: t('notifications') }}
        />
        <Stack.Screen name="ChatList" component={ChatListScreen} options={{ title: t('chat') }} />
        <Stack.Screen name="Chat" component={ChatScreen} options={{ title: t('chat') }} />
        <Stack.Screen
          name="ChangePin"
          component={ChangePinRoute}
          options={{ title: t('changePin') }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
