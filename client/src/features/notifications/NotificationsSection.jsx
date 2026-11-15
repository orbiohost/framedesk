import { BellRing, Check, Laptop, Send, Smartphone, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ChoiceChips } from '../../components/ui/ChoiceChips.jsx';
import { controlClassName } from '../../components/ui/FieldShell.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { SettingsRow, SettingsSection } from '../account/SettingsSection.jsx';
import { openInstall } from '../install/InstallApp.jsx';
import {
  useEnableThisDevice,
  useNotifications,
  useRemoveDevice,
  useSendTestNotification,
  useThisDeviceEndpoint,
  useUpdateNotificationSettings,
} from './hooks.js';
import { pushSupport } from './pushDevice.js';

const EMAIL_OPTIONS = [
  { value: 'fallback', label: 'If no device gets it' },
  { value: 'always', label: 'Always' },
  { value: 'off', label: 'Never' },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return {
    value: hour,
    label: date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  };
});

function isPhoneLabel(label) {
  return /Android|iPhone|iPad/.test(label ?? '');
}

/**
 * Turning notifications on for this device, plus test, off and the reasons
 * it can't be on (blocked, iPhone not on the Home Screen, no browser support).
 */
export function ThisDeviceControl({ overview, compact = false }) {
  const [support, setSupport] = useState(pushSupport);
  const { data: endpoint } = useThisDeviceEndpoint();
  const enable = useEnableThisDevice();
  const remove = useRemoveDevice();
  const test = useSendTestNotification();
  const subscribed =
    support === 'granted' &&
    Boolean(endpoint) &&
    overview.devices.some((device) => device.endpoint === endpoint);

  if (!overview.pushAvailable) {
    return (
      <p className="text-muted text-sm">
        Device notifications aren&apos;t switched on for this server yet. Reminders still come by
        email.
      </p>
    );
  }
  if (support === 'needs-install') {
    return (
      <div className="space-y-2">
        <p className="text-muted text-sm">
          On iPhone and iPad, notifications work once FrameDesk is on your Home Screen. Add it, open
          it from the icon, then turn notifications on here.
        </p>
        <Button size="sm" variant="secondary" onClick={openInstall}>
          <Smartphone className="h-4 w-4" aria-hidden="true" /> Add to Home Screen
        </Button>
      </div>
    );
  }
  if (support === 'unsupported') {
    return (
      <p className="text-muted text-sm">
        This browser can&apos;t show notifications. Reminders come by email instead; Chrome, Edge,
        Firefox and Safari all support them.
      </p>
    );
  }
  if (support === 'denied') {
    return (
      <Alert tone="info">
        Notifications are blocked for this site. Click the icon to the left of the address bar (on
        Android: ⋮ › Settings › Site settings › Notifications), allow them, then reload.
      </Alert>
    );
  }

  if (subscribed) {
    return (
      <div className="space-y-2">
        <p className="text-success flex items-center gap-1.5 text-sm font-medium">
          <Check className="h-4 w-4" aria-hidden="true" /> On for this device
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={test.isPending}
            onClick={() => test.mutate()}
          >
            <Send className="h-4 w-4" aria-hidden="true" /> Send a test
          </Button>
          {!compact && (
            <Button
              size="sm"
              variant="ghost"
              loading={remove.isPending}
              onClick={() => remove.mutate(undefined)}
            >
              Turn off here
            </Button>
          )}
        </div>
        {test.isSuccess && (
          <p className="text-muted text-xs">
            {test.data.delivered
              ? `Sent to ${test.data.delivered} device${test.data.delivered === 1 ? '' : 's'}. It should appear in a few seconds.`
              : 'No device accepted it. Turn notifications off and on again here.'}
          </p>
        )}
        {test.error && <p className="text-danger text-xs">{test.error.message}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="accent"
        loading={enable.isPending}
        onClick={() =>
          enable.mutate(overview.publicKey, { onSettled: () => setSupport(pushSupport()) })
        }
      >
        <BellRing className="h-4 w-4" aria-hidden="true" /> Turn on notifications
      </Button>
      {enable.error && <p className="text-danger text-xs">{enable.error.message}</p>}
    </div>
  );
}

export function NotificationsSection() {
  const { data, isLoading, error } = useNotifications();
  const update = useUpdateNotificationSettings();
  const remove = useRemoveDevice();
  const { data: thisEndpoint } = useThisDeviceEndpoint();

  if (isLoading) return <Skeleton className="h-80 rounded-3xl" />;
  if (error) return <Alert tone="error">{error.message}</Alert>;
  const { settings, devices } = data;

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Reminders"
        description="Before deadlines and calendar events, on your phone, computer or by email."
      >
        <SettingsRow
          label="This device"
          description="Pop-up notifications, even when FrameDesk isn't open."
        >
          <ThisDeviceControl overview={data} />
        </SettingsRow>
        <SettingsRow label="Email" description="A copy of each reminder in your inbox.">
          <ChoiceChips
            label="Send by email"
            options={EMAIL_OPTIONS}
            value={settings.email}
            onChange={(email) => update.mutate({ email })}
          />
        </SettingsRow>
        <SettingsRow
          label="Time for date reminders"
          description="Deadlines and all-day events have no time of their own."
        >
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Reminder time"
              value={settings.dayReminderHour}
              onChange={(event) => update.mutate({ dayReminderHour: Number(event.target.value) })}
              className={`${controlClassName()} h-10 w-auto rounded-full`}
            >
              {HOURS.map((hour) => (
                <option key={hour.value} value={hour.value}>
                  {hour.label}
                </option>
              ))}
            </select>
            <span className="text-muted text-xs">Time zone: {settings.timeZone}</span>
          </div>
        </SettingsRow>
        <SettingsRow label="Defaults" description="Change them on each item under “Remind me”.">
          <ul className="text-muted space-y-1 text-sm">
            <li>Calendar events: 15 minutes before</li>
            <li>All-day events and tasks: on the day</li>
            <li>Projects: 1 day before and on the due day</li>
          </ul>
        </SettingsRow>
        {update.error && (
          <div className="py-3">
            <Alert tone="error">{update.error.message}</Alert>
          </div>
        )}
      </SettingsSection>

      {devices.length > 0 && (
        <SettingsSection
          title="Devices"
          description="Each phone, computer and browser that gets your reminders."
        >
          <ul className="-mx-1 py-2">
            {devices.map((device) => {
              const Icon = isPhoneLabel(device.label) ? Smartphone : Laptop;
              return (
                <li key={device.endpoint} className="flex items-center gap-3 px-1 py-2.5">
                  <span className="bg-subtle grid h-9 w-9 shrink-0 place-items-center rounded-xl">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {device.label ?? 'Browser'}
                      {device.endpoint === thisEndpoint && (
                        <span className="text-muted font-normal"> · this device</span>
                      )}
                    </span>
                    <span className="text-muted block text-xs">
                      Added {new Date(device.addedAt).toLocaleDateString()}
                      {device.lastSuccessAt &&
                        ` · last reminder ${new Date(device.lastSuccessAt).toLocaleDateString()}`}
                    </span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${device.label ?? 'device'}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(device.endpoint)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </SettingsSection>
      )}
    </div>
  );
}
