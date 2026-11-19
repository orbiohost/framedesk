import { Check, ChevronDown, Crown, Gem, Palette, Sparkles, Zap } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { useDismiss } from '../../lib/useDismiss.js';
import { AI_GRADIENT } from './aiStyle.js';

const ICONS = {
  'frame-spark': Zap,
  'frame-ultra': Crown,
  'frame-canvas': Palette,
  'frame-canvas-ultra': Gem,
};

function ModelIcon({ model, className }) {
  const Icon = ICONS[model?.key] ?? Sparkles;
  return <Icon className={className} aria-hidden="true" />;
}

const modelStorageKey = (kind) => `ai:model:${kind}`;

export function readModelChoice(kind) {
  try {
    return localStorage.getItem(modelStorageKey(kind));
  } catch {
    return null;
  }
}

export function writeModelChoice(kind, key) {
  try {
    if (key) localStorage.setItem(modelStorageKey(kind), key);
    else localStorage.removeItem(modelStorageKey(kind));
  } catch {
    // Not remembered; the default is used next time.
  }
}

// The model a choice really means: the saved one if it's still open, else the
// first available model of that kind.
export function pickModel(models = [], kind, key) {
  const ofKind = models.filter((model) => model.kind === kind);
  return (
    ofKind.find((model) => model.key === key && model.status === 'available') ??
    ofKind.find((model) => model.status === 'available') ??
    null
  );
}

// The composer's model switch (FrameDesk names). Models that are on the way
// are listed with a "Coming soon" badge so people know what's next.
export function ModelPicker({ models = [], kind, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const list = models.filter((model) => model.kind === kind);
  const current = pickModel(models, kind, value);
  // One model and nothing coming: nothing to choose.
  if (!current || list.length < 2) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Choose a model"
        className="text-muted hover:bg-surface hover:text-ink inline-flex h-8 max-w-[10rem] items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors disabled:opacity-40"
      >
        <ModelIcon model={current} className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{current.name}</span>
        <ChevronDown
          className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={kind === 'image' ? 'Image model' : 'Chat model'}
          className="border-line/70 bg-surface shadow-lift absolute bottom-full right-0 z-40 mb-2 w-[min(18rem,calc(100vw-2rem))] animate-[fade-in_120ms_ease-out] rounded-2xl border p-1.5"
        >
          <p className="text-muted px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
            {kind === 'image' ? 'Image model' : 'Model'}
          </p>
          {list.map((model) => {
            const soon = model.status !== 'available';
            const selected = model.key === current.key;
            return (
              <button
                key={model.key}
                type="button"
                role="option"
                aria-selected={selected}
                aria-disabled={soon}
                disabled={soon}
                onClick={() => {
                  onChange(model.key);
                  close();
                }}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors',
                  soon ? 'cursor-not-allowed' : 'hover:bg-subtle',
                  selected && 'bg-subtle',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg',
                    soon ? 'bg-subtle text-muted' : cn(AI_GRADIENT, 'text-white'),
                  )}
                >
                  <ModelIcon model={model} className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={cn('text-sm font-medium', soon && 'text-muted')}>
                      {model.name}
                    </span>
                    {model.badge && (
                      <span className="rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                        {model.badge}
                      </span>
                    )}
                    {soon && (
                      <span className="border-line text-muted rounded-full border px-1.5 py-px text-[10px] font-medium">
                        Coming soon
                      </span>
                    )}
                  </span>
                  {model.tagline && (
                    <span className="text-muted block text-xs leading-snug">{model.tagline}</span>
                  )}
                  {!soon && model.kind === 'image' && model.credits > 0 && (
                    <span className="text-muted block text-[11px]">
                      {model.credits} {model.credits === 1 ? 'credit' : 'credits'} per image
                    </span>
                  )}
                  {!soon && model.kind === 'chat' && model.creditMultiplier > 1 && (
                    <span className="text-muted block text-[11px]">
                      Uses {model.creditMultiplier}× credits
                    </span>
                  )}
                </span>
                {selected && (
                  <Check className="text-accent mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
