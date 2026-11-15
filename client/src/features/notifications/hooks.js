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

export function useSendTestNotification() {
  return useMutation({ mutationFn: () => api.post('/notifications/test') });
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

// Once per visit: registers this device's new push address when the browser
// rotated it (the old one stops working), and keeps the time zone current so
// reminders land at the right hour. A device removed from the settings on
// another device stays removed.
export function useNotificationSync() {
  const { data } = useNotifications();
  const setOverview = useSetOverview();
  useEffect(() => {
    if (!data || syncedThisSession) return;
    syncedThisSession = true;
    (async () => {
      const zone = browserTimeZone();
      const subscription = await currentSubscription().catch(() => null);
      const known = data.devices.some((device) => device.endpoint === subscription?.endpoint);
      const previous = readLocal(ENDPOINT_KEY);
      const rotated = subscription && !known && previous && previous !== subscription.endpoint;
      if (rotated && data.pushAvailable && data.settings.push) {
        writeLocal(ENDPOINT_KEY, subscription.endpoint);
        setOverview(
          await api.post('/notifications/devices', {
            ...subscription.toJSON(),
            label: deviceLabel(),
            timeZone: zone,
          }),
        );
      } else if (zone && zone !== data.settings.timeZone) {
        setOverview(await api.patch('/notifications/settings', { timeZone: zone }));
      }
    })().catch(() => {});
  }, [data, setOverview]);
}
