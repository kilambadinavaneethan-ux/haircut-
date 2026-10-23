import { Platform, Alert } from 'react-native';

let Notifications: any = null;
let isNotificationsSupported = false;

try {
  // Dynamic require prevents crash in Expo Go on Android where ExpoTopicSubscriptionModule is absent
  Notifications = require('expo-notifications');
  if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true
      })
    });
    isNotificationsSupported = true;
  }
} catch (error) {
  // Expo Go (SDK 53+) does not bundle native push/topic subscription modules.
  // Gracefully fallback to in-app alerts.
  console.log('[QuickCut] Native push notifications not bundled in Expo Go. In-app alerts will be used.');
}

/**
 * Requests push notification permissions from the user
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (!isNotificationsSupported || !Notifications) {
    return false;
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    let isGranted = existing?.status === 'granted' || existing?.granted === true;

    if (!isGranted) {
      const requested = await Notifications.requestPermissionsAsync();
      isGranted = requested?.status === 'granted' || requested?.granted === true;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('quickcut-queue', {
        name: 'QuickCut Queue Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#F59E0B'
      });
    }

    return isGranted;
  } catch (error) {
    console.warn('Could not request notification permissions:', error);
    return false;
  }
}

/**
 * Triggers a push notification when 2 customers are ahead in queue
 */
export async function notifyTwoAhead(shopName: string, queueNumber: number): Promise<void> {
  if (isNotificationsSupported && Notifications) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '✂️ Your Turn is Approaching!',
          body: `Only 2 customers ahead of ticket #${queueNumber} at ${shopName}. Please head to the shop for check-in!`,
          sound: true,
          data: { queueNumber, shopName }
        },
        trigger: null // Deliver immediately
      });
      return;
    } catch (error) {
      console.warn('Failed to schedule notification:', error);
    }
  }

  // Graceful fallback for Expo Go: show on-screen Alert
  Alert.alert(
    '✂️ Your Turn is Approaching!',
    `Only 2 customers ahead of ticket #${queueNumber} at ${shopName}. Please head to the shop for check-in!`
  );
}
