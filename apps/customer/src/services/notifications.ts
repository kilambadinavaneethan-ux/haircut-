import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification behavior when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

/**
 * Requests push notification permissions from the user
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    let isGranted = (existing as any)?.status === 'granted' || (existing as any)?.granted === true;

    if (!isGranted) {
      const requested = await Notifications.requestPermissionsAsync();
      isGranted = (requested as any)?.status === 'granted' || (requested as any)?.granted === true;
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
  } catch (error) {
    console.warn('Failed to schedule notification:', error);
  }
}
