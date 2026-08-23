import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { Platform, Vibration } from 'react-native';
import { formatEUR } from './parse';

// A notification that arrives while the app is open must still be seen and
// heard — the whole value of this app is the ninety seconds between a shop
// listing stock and the stock going.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let sound = null;
let ready = false;

export async function initAlerts() {
  if (ready) return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') await Notifications.requestPermissionsAsync();

    if (Platform.OS === 'android') {
      // A dedicated channel, because the default one is muted by whatever the
      // person muted last and this is the one alert that must not be quiet.
      await Notifications.setNotificationChannelAsync('stock-alert', {
        name: 'Stock alert',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'alarm.wav',
        vibrationPattern: [0, 400, 200, 400],
        lightColor: '#F59E0B',
        bypassDnd: false,
      });
    }

    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      staysActiveInBackground: false,
    });
    const { sound: s } = await Audio.Sound.createAsync(
      require('../../assets/alarm.wav'),
      { volume: 1.0 }
    );
    sound = s;
    ready = true;
  } catch (e) {
    // Losing the tone must not lose the notification.
    console.warn('[alerts] init:', e && e.message);
    ready = true;
  }
}

async function playTone() {
  try {
    if (!sound) return;
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (e) { console.warn('[alerts] tone:', e && e.message); }
}

/**
 * The announcement, spoken exactly as specified:
 *   "LENOVO IN STOCK - HGSPOT - €429,00"
 *
 * Spoken rather than played from a file because the retailer and the price are
 * the two things worth hearing and neither can be recorded in advance.
 */
export async function announceInStock(result) {
  const line = `LENOVO IN STOCK - ${result.store} - ${formatEUR(result.price)}`;

  Vibration.vibrate([0, 400, 200, 400]);
  await playTone();

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🟢 LENOVO IN STOCK',
        body: `${result.store} · ${formatEUR(result.price)}`,
        data: { url: result.url, id: result.id },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        color: '#F59E0B',
      },
      trigger: null,                       // now
      ...(Platform.OS === 'android' ? { channelId: 'stock-alert' } : {}),
    });
  } catch (e) { console.warn('[alerts] notify:', e && e.message); }

  // A beat after the tone, so the two do not talk over each other.
  setTimeout(() => {
    try {
      Speech.speak(line, {
        language: 'en-GB',
        rate: 0.94,
        pitch: 1.0,
      });
    } catch (e) { console.warn('[alerts] speech:', e && e.message); }
  }, 700);
}

export async function announceMany(results) {
  for (let i = 0; i < results.length; i++) {
    await announceInStock(results[i]);
    if (i < results.length - 1) await new Promise((r) => setTimeout(r, 4000));
  }
}

export function stopSpeaking() {
  try { Speech.stop(); } catch {}
}
