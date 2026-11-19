import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../../lib/apiClient.js';
import { readLocal, writeLocal } from '../../lib/storage.js';
import {
  browserTimeZone,
  currentSubscription,
  deviceLabel,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from './pushDevice.js';

const KEY = ['notifications'];
// The push address this browser last registered, to spot a rotated one.
const ENDPOINT_KEY = 'push:endpoint';
// Set when someone turns notifications off on this device: never re-enabled by itself.
const OPT_OUT_KEY = 'push:optOut';

// { pushAvailable, publicKey, settings, devices }
export function useNotifications() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get('/notifications'),
    staleTime: 5 * 60 * 1000,
  });
}

function useSetOverview() {
  const queryClient = useQueryClient();
  return (overview) => {
    queryClient.setQueryData(KEY, overview);
    queryClient.invalidateQueries({ queryKey: [...KEY, 'this-device'], exact: true });
  };
}

export function useUpdateNotificationSettings() {
  const setOverview = useSetOverview();
  return useMutation({
    mutationFn: (settings) => api.patch('/notifications/settings', settings),
    onSuccess: setOverview,
  });
}

// From a tap: asks the browser for permission, then registers this device.
export function useEnableThisDevice() {
  const setOverview = useSetOverview();
  return useMutation({
    mutationFn: async (publicKey) => {
      const subscription = await subscribeThisDevice(publicKey);
      writeLocal(ENDPOINT_KEY, subscription.endpoint);
      writeLocal(OPT_OUT_KEY, '0');
      return api.post('/notifications/devices', {
        ...subscription,
        label: deviceLabel(),
        timeZone: browserTimeZone(),
      });
    },
    onSuccess: setOverview,
  });
}

export function useRemoveDevice() {
  const setOverview = useSetOverview();
  return useMutation({
    // No endpoint: this device (also unsubscribes it in the browser).
    mutationFn: async (endpoint) => {
      if (!endpoint) writeLocal(OPT_OUT_KEY, '1');
      const target = endpoint ?? (await unsubscribeThisDevice());
      if (!target) return api.get('/notifications');
      if (endpoint) {
        const mine = await currentSubscription();
        if (mine?.endpoint === endpoint) await mine.unsubscribe().catch(() => {});
      }
      return api.delete('/notifications/devices', { endpoint: target });
    },
    onSuccess: setOverview,
  });
}

// options: { delaySeconds (0-30, time to close the app), kind: 'reminder' | 'alert' }.
export function useSendTestNotification() {
  return useMutation({ mutationFn: (options) => api.post('/notifications/test', options ?? {}) });
}

// This device's push address, if it has one and the server knows it.
export function useThisDeviceEndpoint() {
  return useQuery({
    queryKey: [...KEY, 'this-device'],
    queryFn: async () => (await currentSubscription())?.endpoint ?? null,
    staleTime: Infinity,
  });
}

let syncedThisSession = false;

async function register(subscription, zone) {
  writeLocal(ENDPOINT_KEY, subscription.endpoint);
  return api.post('/notifications/devices', {
    ...subscription.toJSON(),
    label: deviceLabel(),
    timeZone: zone,
  });
}

// Once per visit, so alerts keep reaching this device while the app is closed:
// - permission given but no push address (cleared site data, a new server key,
//   the browser dropped it): subscribes again, no prompt needed;
// - a new address (the browser rotated it): registers it with the server;
// - keeps the time zone current so reminders land at the right hour.
// Turning it off here, or removing this device from another one, is respected.
export function useNotificationSync() {
  const { data } = useNotifications();
  const setOverview = useSetOverview();
  useEffect(() => {
    if (!data || syncedThisSession) return;
    syncedThisSession = true;
    (async () => {
      const zone = browserTimeZone();
      const wanted =
        data.pushAvailable &&
        data.settings.push &&
        data.publicKey &&
        readLocal(OPT_OUT_KEY) !== '1' &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted';
      let subscription = await currentSubscription().catch(() => null);
      const known = data.devices.some((device) => device.endpoint === subscription?.endpoint);
      const previous = readLocal(ENDPOINT_KEY);
      const removedElsewhere = subscription && !known && previous === subscription.endpoint;

      if (wanted && !removedElsewhere && (!subscription || !known)) {
        if (!subscription) {
          // Permission is already granted, so this shows no prompt.
          await subscribeThisDevice(data.publicKey);
          subscription = await currentSubscription();
        }
        if (subscription) {
          setOverview(await register(subscription, zone));
          return;
        }
      }
      if (zone && zone !== data.settings.timeZone) {
        setOverview(await api.patch('/notifications/settings', { timeZone: zone }));
      }
    })().catch(() => {});
  }, [data, setOverview]);
}
