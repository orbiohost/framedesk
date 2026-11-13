import { createAvatar } from '@dicebear/core';
import * as lorelei from '@dicebear/lorelei';
import * as notionists from '@dicebear/notionists';
import * as pixelArt from '@dicebear/pixel-art';
import * as shapes from '@dicebear/shapes';
import * as thumbs from '@dicebear/thumbs';
import { Check, ImageUp, RefreshCw, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { cn } from '../../lib/cn.js';
import { readImageFile, squareImage } from './avatarImage.js';
import { useClearAvatar, useSetAvatar } from './hooks.js';

// All five styles are CC0 (public domain), so no attribution is required.
const STYLES = [
  { id: 'notionists', label: 'Sketch', style: notionists },
  { id: 'lorelei', label: 'Portrait', style: lorelei },
  { id: 'thumbs', label: 'Thumbs', style: thumbs },
  { id: 'pixel-art', label: 'Pixel', style: pixelArt },
  { id: 'shapes', label: 'Abstract', style: shapes },
];

const BACKGROUNDS = ['c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'b6e3f4', 'c7f0d8'];
const VARIANTS_SHOWN = 12;

function avatarUri(style, seed) {
  return createAvatar(style, { seed, backgroundColor: BACKGROUNDS, size: 128 }).toDataUri();
}

function randomSeed() {
  return Math.random().toString(36).slice(2, 10);
}

function StyleTabs({ value, onChange }) {
  return (
    <div role="tablist" aria-label="Avatar style" className="flex flex-wrap gap-1.5">
      {STYLES.map((style) => (
        <button
          key={style.id}
          type="button"
          role="tab"
          aria-selected={style.id === value}
          onClick={() => onChange(style.id)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            style.id === value ? 'pill-active' : 'bg-subtle text-muted hover:text-ink',
          )}
        >
          {style.label}
        </button>
      ))}
    </div>
  );
}

// Lets the person drag a slider to zoom into an uploaded photo before saving.
function PhotoAdjust({ source, zoom, onZoom }) {
  return (
    <div className="bg-subtle/60 flex items-center gap-4 rounded-2xl p-3">
      <span className="h-16 w-16 shrink-0 overflow-hidden rounded-full">
        <img
          src={source}
          alt="Uploaded photo"
          className="h-full w-full object-cover"
          style={{ transform: `scale(${zoom})` }}
        />
      </span>
      <label className="flex-1 text-xs font-medium">
        Zoom
        <input
          type="range"
          min="1"
          max="3"
          step="0.05"
          value={zoom}
          onChange={(event) => onZoom(Number(event.target.value))}
          className="accent-accent mt-1 block w-full"
        />
      </label>
    </div>
  );
}

export default function AvatarPicker({ user, onSaved }) {
  const setAvatar = useSetAvatar();
  const clearAvatar = useClearAvatar();
  const fileInput = useRef(null);

  const [styleId, setStyleId] = useState(STYLES[0].id);
  const [seeds, setSeeds] = useState(() => [
    user.name,
    ...Array.from({ length: VARIANTS_SHOWN - 1 }, randomSeed),
  ]);
  // What the preview shows before saving: { kind: 'preset', uri } or { kind: 'photo', source }.
  const [pending, setPending] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [localError, setLocalError] = useState(null);

  const style = STYLES.find((entry) => entry.id === styleId).style;
  const variants = useMemo(
    () => seeds.map((seed) => ({ seed, uri: avatarUri(style, seed) })),
    [style, seeds],
  );

  const busy = setAvatar.isPending || clearAvatar.isPending;
  const error = localError ?? setAvatar.error?.message ?? clearAvatar.error?.message;
  const previewSrc =
    pending?.kind === 'preset'
      ? pending.uri
      : pending?.kind === 'photo'
        ? pending.source
        : user.avatarUrl;

  function reset() {
    setPending(null);
    setZoom(1);
    setLocalError(null);
    setAvatar.reset();
    clearAvatar.reset();
  }

  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    reset();
    try {
      setPending({ kind: 'photo', source: await readImageFile(file) });
    } catch (readError) {
      setLocalError(readError.message);
    }
  }

  async function save() {
    setLocalError(null);
    try {
      const image =
        pending.kind === 'photo'
          ? await squareImage(pending.source, { zoom })
          : await squareImage(pending.uri);
      setAvatar.mutate(image, {
        onSuccess: () => {
          setPending(null);
          onSaved?.();
        },
      });
    } catch (convertError) {
      setLocalError(convertError.message);
    }
  }

  function remove() {
    reset();
    clearAvatar.mutate();
  }

  return (
    <div className="space-y-4 p-5">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-4">
        <span className="relative">
          {pending?.kind === 'photo' ? (
            <span className="ring-surface block h-20 w-20 overflow-hidden rounded-full ring-2">
              <img
                src={previewSrc}
                alt=""
                className="h-full w-full object-cover"
                style={{ transform: `scale(${zoom})` }}
              />
            </span>
          ) : (
            <Avatar name={user.name} src={previewSrc} size="xl" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Profile picture</p>
          <p className="text-muted text-xs">
            Upload a photo or pick an avatar below. Your teammates see it everywhere.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
            >
              <ImageUp className="h-4 w-4" aria-hidden="true" />
              Upload photo
            </Button>
            {user.avatarUrl && !pending && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={remove}
                loading={clearAvatar.isPending}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove
              </Button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            onChange={onFile}
            className="hidden"
          />
        </div>
      </div>

      {pending?.kind === 'photo' && (
        <PhotoAdjust source={pending.source} zoom={zoom} onZoom={setZoom} />
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StyleTabs value={styleId} onChange={setStyleId} />
          <button
            type="button"
            onClick={() => setSeeds(Array.from({ length: VARIANTS_SHOWN }, randomSeed))}
            title="Show different avatars"
            aria-label="Show different avatars"
            className="text-muted hover:bg-subtle hover:text-ink grid h-8 w-8 place-items-center rounded-full"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <ul className="grid grid-cols-6 gap-2 sm:gap-3">
          {variants.map(({ seed, uri }) => {
            const selected = pending?.kind === 'preset' && pending.uri === uri;
            return (
              <li key={seed}>
                <button
                  type="button"
                  onClick={() => {
                    reset();
                    setPending({ kind: 'preset', uri });
                  }}
                  aria-label="Use this avatar"
                  aria-pressed={selected}
                  className={cn(
                    'relative block aspect-square w-full overflow-hidden rounded-full ring-2 transition',
                    selected ? 'ring-accent' : 'hover:ring-line ring-transparent',
                  )}
                >
                  <img src={uri} alt="" className="h-full w-full" />
                  {selected && (
                    <span className="bg-accent text-accent-ink absolute bottom-0 right-0 grid h-5 w-5 place-items-center rounded-full">
                      <Check className="h-3 w-3" aria-hidden="true" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {pending && (
        <div className="flex gap-2">
          <Button type="button" onClick={save} loading={setAvatar.isPending}>
            Save picture
          </Button>
          <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
