import { useId, useState } from 'react';
import { cn } from '../../lib/cn.js';

// Presets as chips, plus "Custom": a number and a unit (e.g. seconds or
// minutes). Values are in the smallest unit (`units[0]`, factor 1).
//   presets: [{ value, label }]
//   units:   [{ label: 'sec', factor: 1 }, { label: 'min', factor: 60 }]

const chip = (active) =>
  cn(
    'h-8 rounded-full border px-3 text-xs font-medium transition-colors',
    active
      ? 'border-accent bg-accent text-white'
      : 'border-line/70 bg-surface text-ink/80 hover:bg-subtle',
  );

function bestUnit(value, units) {
  return [...units].reverse().find((unit) => value % unit.factor === 0) ?? units[0];
}

export function RingValuePicker({ label, presets, units, value, onChange, min, max, disabled }) {
  const labelId = useId();
  const isPreset = presets.some((preset) => preset.value === value);
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const [unit, setUnit] = useState(() => bestUnit(value || units[0].factor, units));
  const [amount, setAmount] = useState(() => String(Math.round((value || 0) / unit.factor) || ''));
  const [error, setError] = useState(null);
  const custom = customOpen || !isPreset;

  function commit(nextAmount = amount, nextUnit = unit) {
    const number = Number(nextAmount);
    if (!Number.isFinite(number) || number <= 0) {
      setError('Enter a number');
      return;
    }
    const total = Math.round(number * nextUnit.factor);
    if (total < min || total > max) {
      const top = bestUnit(max, units);
      setError(`Between ${min} ${units[0].label} and ${max / top.factor} ${top.label}`);
      return;
    }
    setError(null);
    if (total !== value) onChange(total);
  }

  return (
    <div className="space-y-2">
      <p id={labelId} className="sr-only">
        {label}
      </p>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.value}
            type="button"
            disabled={disabled}
            aria-pressed={!custom && value === preset.value}
            onClick={() => {
              setCustomOpen(false);
              setError(null);
              onChange(preset.value);
            }}
            className={chip(!custom && value === preset.value)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          aria-pressed={custom}
          onClick={() => {
            setCustomOpen(true);
            const start = bestUnit(value || units[0].factor, units);
            setUnit(start);
            setAmount(String(Math.round((value || 0) / start.factor) || ''));
          }}
          className={chip(custom)}
        >
          Custom
        </button>
      </div>
      {custom && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            disabled={disabled}
            aria-label={`${label}: custom amount`}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            onBlur={() => commit()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit();
              }
            }}
            className="border-line bg-surface focus:border-accent h-9 w-24 rounded-full border px-3 text-sm outline-none"
          />
          {units.length > 1 ? (
            <select
              aria-label={`${label}: unit`}
              disabled={disabled}
              value={unit.label}
              onChange={(event) => {
                const next = units.find((item) => item.label === event.target.value);
                setUnit(next);
                commit(amount, next);
              }}
              className="border-line bg-surface h-9 rounded-full border px-3 text-sm outline-none"
            >
              {units.map((item) => (
                <option key={item.label} value={item.label}>
                  {item.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-muted text-sm">{units[0].label}</span>
          )}
          {error && <span className="text-danger text-xs">{error}</span>}
        </div>
      )}
    </div>
  );
}

// The three ring controls, shared by Profile settings and the Alert dialog.
export const RING_FIELDS = {
  ringSeconds: {
    label: 'Ring for',
    presets: [5, 10, 20, 30, 60].map((value) => ({ value, label: `${value} s` })),
    units: [
      { label: 'seconds', factor: 1 },
      { label: 'minutes', factor: 60 },
    ],
    min: 3,
    max: 300,
  },
  repeatMinutes: {
    label: 'Ring again every',
    presets: [1, 2, 5, 10, 15, 30].map((value) => ({ value, label: `${value} min` })),
    units: [
      { label: 'minutes', factor: 1 },
      { label: 'hours', factor: 60 },
    ],
    min: 1,
    max: 1440,
  },
  maxRepeats: {
    label: 'Times',
    presets: [
      { value: 0, label: 'Forever, until opened' },
      { value: 1, label: 'Once more' },
      { value: 3, label: '3 times' },
      { value: 6, label: '6 times' },
      { value: 12, label: '12 times' },
    ],
    units: [{ label: 'times', factor: 1 }],
    min: 1,
    max: 1000,
  },
};

export function describeRing({ ringSeconds, repeatMinutes, maxRepeats }) {
  const ring = ringSeconds % 60 === 0 ? `${ringSeconds / 60} min` : `${ringSeconds} s`;
  const every = repeatMinutes % 60 === 0 ? `${repeatMinutes / 60} h` : `${repeatMinutes} min`;
  const times = maxRepeats === 0 ? 'until opened' : `${maxRepeats} more ${maxRepeats === 1 ? 'time' : 'times'}`;
  return `Rings ${ring}, then every ${every}, ${times}`;
}
