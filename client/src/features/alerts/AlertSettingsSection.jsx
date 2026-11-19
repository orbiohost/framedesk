import { Play, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ChoiceChips } from '../../components/ui/ChoiceChips.jsx';
import { controlClassName } from '../../components/ui/FieldShell.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { Switch } from '../../components/ui/Switch.jsx';
import { SettingsRow, SettingsSection } from '../account/SettingsSection.jsx';
import { ALERT_SOUND_OPTIONS, startRinging, unlockAlertAudio } from './alertSound.js';
import { useAlertSettings, useUpdateAlertSettings } from './hooks.js';
import { RING_FIELDS, RingValuePicker, describeRing } from './RingValuePicker.jsx';

const FROM_OPTIONS = [
  { value: 'everyone', label: 'Anyone in the workspace' },
  { value: 'admins', label: 'Owners and admins only' },
];
const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: hour,
  label: new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: 'numeric' }),
}));

// Profile → Notifications → Project alerts: how alerts from teammates ring
// on this person's devices.
export function AlertSettingsSection() {
  const { data: settings, isLoading, error } = useAlertSettings();
  const update = useUpdateAlertSettings();
  const preview = useRef(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => () => preview.current?.stop(), []);

  if (isLoading) return <Skeleton className="h-96 rounded-3xl" />;
  if (error) return <Alert tone="error">{error.message}</Alert>;

  const set = (input) => update.mutate(input);

  function play(overrides = {}) {
    preview.current?.stop();
    unlockAlertAudio();
    const seconds = Math.min(settings.ringSeconds, 6);
    preview.current = startRinging({ ...settings, ...overrides, seconds });
    setPreviewing(true);
    setTimeout(() => setPreviewing(false), seconds * 1000);
  }

  function stopPreview() {
    preview.current?.stop();
    setPreviewing(false);
  }

  const off = !settings.enabled;

  return (
    <SettingsSection
      title="Project alerts"
      description="When a teammate presses “Alert” on a project, your phone or computer rings and shows a pop-up that opens it."
      action={
        <Button
          size="sm"
          variant="secondary"
          onClick={() => (previewing ? stopPreview() : play())}
          disabled={off}
        >
          {previewing ? (
            <>
              <Square className="h-3.5 w-3.5" aria-hidden="true" /> Stop
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" aria-hidden="true" /> Test sound
            </>
          )}
        </Button>
      }
    >
      <SettingsRow label="Alerts" description="Turn off to stop all project alerts reaching you.">
        <Switch
          checked={settings.enabled}
          onChange={(enabled) => set({ enabled })}
          label={settings.enabled ? 'On' : 'Off'}
        />
      </SettingsRow>

      <fieldset disabled={off} className={off ? 'pointer-events-none opacity-50' : undefined}>
        <SettingsRow label="Sound" description="Tap one to hear it.">
          <ChoiceChips
            label="Alert sound"
            options={ALERT_SOUND_OPTIONS}
            value={settings.sound}
            onChange={(sound) => {
              set({ sound });
              play({ sound });
            }}
          />
        </SettingsRow>

        <SettingsRow label="Volume">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.1}
              aria-label="Alert volume"
              value={settings.volume}
              onChange={(event) => set({ volume: Number(event.target.value) })}
              onPointerUp={() => play()}
              className="accent-accent w-48"
            />
            <span className="text-muted w-10 text-sm tabular-nums">
              {Math.round(settings.volume * 100)}%
            </span>
          </div>
        </SettingsRow>

        <SettingsRow label="Ring for" description="How long the sound plays each time (up to 5 min).">
          <RingValuePicker
            {...RING_FIELDS.ringSeconds}
            value={settings.ringSeconds}
            onChange={(ringSeconds) => set({ ringSeconds })}
          />
        </SettingsRow>

        <SettingsRow
          label="If I miss it, ring again every"
          description="Until you open the project or dismiss the alert (up to every 24 h)."
        >
          <RingValuePicker
            {...RING_FIELDS.repeatMinutes}
            value={settings.repeatMinutes}
            onChange={(repeatMinutes) => set({ repeatMinutes })}
          />
        </SettingsRow>

        <SettingsRow
          label="How many times"
          description="“Forever” keeps ringing until you open the project (for up to 7 days)."
        >
          <RingValuePicker
            {...RING_FIELDS.maxRepeats}
            value={settings.maxRepeats}
            onChange={(maxRepeats) => set({ maxRepeats })}
          />
          <p className="text-muted mt-2 text-xs">{describeRing(settings)}.</p>
        </SettingsRow>

        <SettingsRow label="Vibrate" description="On phones that can (Android).">
          <Switch
            checked={settings.vibrate}
            onChange={(vibrate) => set({ vibrate })}
            label={settings.vibrate ? 'On' : 'Off'}
          />
        </SettingsRow>

        <SettingsRow label="Who can alert me">
          <ChoiceChips
            label="Who can alert me"
            options={FROM_OPTIONS}
            value={settings.allowFrom}
            onChange={(allowFrom) => set({ allowFrom })}
          />
        </SettingsRow>

        <SettingsRow
          label="Quiet hours"
          description="Alerts arrive silently, and repeats wait until quiet hours end."
        >
          <div className="space-y-3">
            <Switch
              checked={settings.quietHours.enabled}
              onChange={(enabled) => set({ quietHours: { enabled } })}
              label={settings.quietHours.enabled ? 'On' : 'Off'}
            />
            {settings.quietHours.enabled && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                From
                <select
                  aria-label="Quiet hours start"
                  value={settings.quietHours.start}
                  onChange={(event) => set({ quietHours: { start: Number(event.target.value) } })}
                  className={`${controlClassName()} h-10 w-auto rounded-full`}
                >
                  {HOURS.map((hour) => (
                    <option key={hour.value} value={hour.value}>
                      {hour.label}
                    </option>
                  ))}
                </select>
                to
                <select
                  aria-label="Quiet hours end"
                  value={settings.quietHours.end}
                  onChange={(event) => set({ quietHours: { end: Number(event.target.value) } })}
                  className={`${controlClassName()} h-10 w-auto rounded-full`}
                >
                  {HOURS.map((hour) => (
                    <option key={hour.value} value={hour.value}>
                      {hour.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </SettingsRow>
      </fieldset>

      <SettingsRow label="Good to know">
        <ul className="text-muted list-disc space-y-1 pl-4 text-sm">
          <li>
            With FrameDesk open, the alert plays your chosen sound for the full time and shows a
            pop-up.
          </li>
          <li>
            With FrameDesk closed, your phone or computer shows a notification with its normal
            notification sound, and repeats it. Turn on notifications for this device under
            Reminders above. On iPhone and iPad, add FrameDesk to the Home Screen first.
          </li>
        </ul>
      </SettingsRow>

      {update.error && (
        <div className="py-3">
          <Alert tone="error">{update.error.message}</Alert>
        </div>
      )}
    </SettingsSection>
  );
}
