import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useUpdateProfile } from '../users/hooks.js';
import { SettingsRow, SettingsSection } from './SettingsSection.jsx';

const PRESETS = [0, 15, 30, 60, 90, 120, 180];
const MAX_MINUTES = 600;

function presetLabel(minutes) {
  if (minutes === 0) return 'Off — transcribe by hand';
  if (minutes < 60) return `Up to ${minutes} minutes`;
  const hours = minutes / 60;
  return `Up to ${hours} ${hours === 1 ? 'hour' : 'hours'}${minutes === 60 ? ' (default)' : ''}`;
}

const field =
  'border-line bg-surface h-10 rounded-xl border px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40';

// How long a clip dropped into a project's Notes & Briefs folder may be and
// still be transcribed by itself (local speech-to-text).
export function AutoTranscribeSection({ user }) {
  const saved = user.autoTranscribeMinutes ?? 60;
  const update = useUpdateProfile();
  const [custom, setCustom] = useState(() => !PRESETS.includes(saved));
  const [minutes, setMinutes] = useState(String(saved));
  const value = Number(minutes);
  const valid = Number.isInteger(value) && value >= 0 && value <= MAX_MINUTES;
  const dirty = valid && value !== saved;

  function save(next) {
    update.mutate({ autoTranscribeMinutes: next });
  }

  return (
    <SettingsSection
      title="Transcription"
      description="Voice notes and recordings in a project's Notes & Briefs folder."
    >
      <SettingsRow
        label="Auto-transcribe clips"
        description="Audio and video you add to Notes & Briefs are transcribed by themselves when they are no longer than this. The AI brief then reads the transcript, which is faster and uses fewer credits. Longer clips can still be transcribed by hand."
      >
        <div className="space-y-3">
          {update.error && <Alert tone="error">{update.error.message}</Alert>}
          <select
            aria-label="Auto-transcribe clips up to"
            className={`${field} w-full`}
            value={custom ? 'custom' : String(saved)}
            onChange={(event) => {
              if (event.target.value === 'custom') {
                setCustom(true);
                return;
              }
              setCustom(false);
              setMinutes(event.target.value);
              save(Number(event.target.value));
            }}
          >
            {PRESETS.map((preset) => (
              <option key={preset} value={String(preset)}>
                {presetLabel(preset)}
              </option>
            ))}
            <option value="custom">Custom length…</option>
          </select>
          {custom && (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (dirty) save(value);
              }}
            >
              <input
                type="number"
                min={0}
                max={MAX_MINUTES}
                step={1}
                inputMode="numeric"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                aria-label="Minutes"
                className={`${field} w-28`}
              />
              <span className="text-muted text-sm">
                minutes (0 turns it off, up to {MAX_MINUTES})
              </span>
              <Button type="submit" size="sm" loading={update.isPending} disabled={!dirty}>
                Save
              </Button>
            </form>
          )}
          {update.isSuccess && !update.isPending && (
            <p className="text-success text-xs">Saved. It applies to clips you add from now on.</p>
          )}
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
